'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const PUBLIC=path.join(__dirname,'public'),MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function json(res,status,value,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(value));}
function parseBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1024*1024)reject(Error('too_large'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(Error('invalid_json'));}});req.on('error',reject);});}
function constantEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function createDashboard({adminUser,adminPassword,getSnapshot,getHistory}){
 if(!adminUser||String(adminPassword).length<12)throw Error('DASHBOARD_ADMIN_PASSWORD must contain at least 12 characters');
 const sessions=new Map(),clients=new Set();let exe={online:false,lastSeen:null,websiteOnline:false,pending:0,lastSyncAt:null};
 function cookie(req){const m=/(?:^|;\s*)hr_admin=([^;]+)/.exec(req.headers.cookie||'');return m&&m[1];}
 function authenticated(req,url){const token=cookie(req)||url.searchParams.get('session');const expiry=sessions.get(token);if(!expiry||expiry<Date.now()){if(token)sessions.delete(token);return false;}return true;}
 function cleanDb(db){if(!db)return null;return{...db,employees:(db.employees||[]).map(({pass,token,resetCode,...employee})=>employee)};}
 function dashboardData(){const store=getSnapshot(),db=cleanDb(store.db)||{},history=getHistory();const attendance=Object.values(db.att||{}).filter(Boolean).length;return{store:{version:store.version,sourceVersion:store.sourceVersion,updatedAt:store.updatedAt},status:{synologyOnline:true,exeOnline:exe.online&&Date.now()-new Date(exe.lastSeen).getTime()<45000,exeLastSeen:exe.lastSeen,websiteOnline:exe.websiteOnline,lastSyncAt:exe.lastSyncAt||store.updatedAt,pending:exe.pending},counts:{employees:(db.employees||[]).length,transactions:(db.requests||[]).length,tasks:(db.tasks||[]).length,attendance,leaves:(db.requests||[]).filter(r=>r.type==='leave').length,documents:(db.docs||[]).length,attachments:store.attachmentCount||0},employees:db.employees||[],transactions:db.requests||[],tasks:db.tasks||[],attendance:db.att||{},documents:db.docs||[],history:history.slice(-200).reverse()};}
 function frame(value){const payload=Buffer.from(JSON.stringify(value));if(payload.length<126)return Buffer.concat([Buffer.from([0x81,payload.length]),payload]);const h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(payload.length,2);return Buffer.concat([h,payload]);}
 function broadcast(type,payload={}){const message=frame({type,payload,data:dashboardData(),at:new Date().toISOString()});for(const socket of clients)try{socket.write(message);}catch{clients.delete(socket);}}
 function heartbeat(value={}){exe={...exe,...value,online:true,lastSeen:new Date().toISOString()};broadcast('heartbeat',exe);}
 async function handle(req,res,url){
  if(url.pathname==='/admin/login'&&req.method==='POST'){const input=await parseBody(req);if(!constantEqual(input.username,adminUser)||!constantEqual(input.password,adminPassword))return json(res,401,{error:'بيانات الدخول غير صحيحة'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600*1000);return json(res,200,{ok:true},{'set-cookie':`hr_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});}
  if(url.pathname==='/admin/logout'&&req.method==='POST'){sessions.delete(cookie(req));return json(res,200,{ok:true},{'set-cookie':'hr_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(url.pathname==='/admin/session')return json(res,authenticated(req,url)?200:401,{authenticated:authenticated(req,url)});
  if(url.pathname==='/admin/data'){if(!authenticated(req,url))return json(res,401,{error:'unauthorized'});return json(res,200,dashboardData());}
  if(url.pathname==='/login'){const file=path.join(PUBLIC,'login.html');res.writeHead(200,{'content-type':MIME['.html'],'cache-control':'no-store'});return fs.createReadStream(file).pipe(res);}
  if(url.pathname==='/'||url.pathname==='/index.html'){if(!authenticated(req,url)){res.writeHead(302,{location:'/login'});return res.end();}}
  const relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'');const file=path.resolve(PUBLIC,relative);if(!file.startsWith(PUBLIC+path.sep))return json(res,403,{error:'forbidden'});try{if(!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);}catch{return json(res,404,{error:'not_found'});}
 }
 function upgrade(req,socket){const url=new URL(req.url,'http://dashboard');if(url.pathname!=='/ws'||!authenticated(req,url)){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');return socket.destroy();}const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return;}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);clients.add(socket);socket.write(frame({type:'snapshot',data:dashboardData(),at:new Date().toISOString()}));socket.on('close',()=>clients.delete(socket));socket.on('error',()=>clients.delete(socket));}
 const timer=setInterval(()=>{if(exe.lastSeen&&Date.now()-new Date(exe.lastSeen).getTime()>=45000&&exe.online){exe.online=false;broadcast('heartbeat',exe);}},15000);timer.unref();
 return{handle,upgrade,broadcast,heartbeat,data:dashboardData,close:()=>{clearInterval(timer);for(const s of clients)s.destroy();}};
}
module.exports={createDashboard};
