'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const SESSION_MS=12*60*60*1000;
function atomicWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,value,{encoding:'utf8',mode:0o600});fs.renameSync(temp,file);}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>80*1024*1024)reject(new Error('Payload too large'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function activeHr(db){return db?.employees?.find(employee=>employee.role==='hr'&&employee.active!==false);}
function protectSuperAdmin(previous,next,superAdminId){
  if(!previous||!superAdminId)return next;
  const protectedAccount=previous.employees?.find(employee=>String(employee.id)===String(superAdminId));
  if(!protectedAccount)return next;
  next.employees=Array.isArray(next.employees)?next.employees:[];
  const index=next.employees.findIndex(employee=>String(employee.id)===String(superAdminId));
  if(index<0)next.employees.push(protectedAccount);
  else next.employees[index]={...next.employees[index],id:protectedAccount.id,pass:protectedAccount.pass,role:'hr',active:true};
  return next;
}
function bearer(req){if(req.headers['x-auth'])return req.headers['x-auth'];const match=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'');return match&&match[1];}
function createLocalServer({dataDir,publicDir,port=0}){
  fs.mkdirSync(dataDir,{recursive:true});const storeFile=path.join(dataDir,'store.json'),kvDir=path.join(dataDir,'kv'),backupDir=path.join(dataDir,'backups'),outboxDir=path.join(dataDir,'outbox');[kvDir,backupDir,outboxDir].forEach(d=>fs.mkdirSync(d,{recursive:true}));
  const sessions=new Map(),loadStore=()=>readJson(storeFile,{version:0,db:null,updatedAt:null});
  function backupBundle(store){
    return {
      format:'alsalman-hr-desktop-backup',
      formatVersion:1,
      exportedAt:new Date().toISOString(),
      store,
      attachments:fs.readdirSync(kvDir).filter(name=>name.endsWith('.json')).map(name=>({name,value:readJson(path.join(kvDir,name),null)})).filter(item=>item.value)
    };
  }
  function saveStore(store){store.updatedAt=new Date().toISOString();atomicWrite(storeFile,JSON.stringify(store));atomicWrite(path.join(backupDir,`store-${store.updatedAt.replace(/[:.]/g,'-')}.json`),JSON.stringify(store));const files=fs.readdirSync(backupDir).sort();while(files.length>60)fs.unlinkSync(path.join(backupDir,files.shift()));}
  const keyFile=k=>path.join(kvDir,crypto.createHash('sha256').update(String(k)).digest('hex')+'.json');
  function authorized(req){const token=bearer(req),expiry=sessions.get(token);if(!expiry||expiry<Date.now()){if(token)sessions.delete(token);return false;}return true;}
  function serve(req,res,url){const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');const root=path.resolve(publicDir),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return json(res,403,{error:'forbidden'});try{if(!fs.statSync(file).isFile())throw new Error();res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':rel==='index.html'?'no-store':'public, max-age=86400'});fs.createReadStream(file).pipe(res);}catch{json(res,404,{error:'not_found'});}}
  async function api(req,res,url){const endpoint=url.pathname.replace(/\.php$/,'');let store=loadStore();
    if(endpoint==='/api/ping'&&req.method==='GET')return json(res,200,{ok:true,initialized:!!store.db,needsHrSetup:!!store.db&&!activeHr(store.db),version:store.version,updatedAt:store.updatedAt,desktop:true});
    if(endpoint==='/api/setup/hr'&&req.method==='POST'){
      if(!store.db||activeHr(store.db))return json(res,409,{error:'setup_not_available'});
      const input=await body(req),id=String(input.id||'').trim(),name=String(input.name||'').trim(),password=String(input.password||'');
      if(!/^\d{4,20}$/.test(id)||name.length<3||password.length<10||!/[A-Za-z]/.test(password)||!/\d/.test(password))return json(res,400,{error:'invalid_setup'});
      const employees=Array.isArray(store.db.employees)?store.db.employees:[];
      const index=employees.findIndex(employee=>String(employee.id)===id||String(employee.iqama||'')===id);
      const account={...(index>=0?employees[index]:{}),id,iqama:(index>=0&&employees[index].iqama)||id,name,pass:password,role:'hr',active:true,mustChangePass:false,superAdmin:true};
      if(index>=0)employees[index]=account;else employees.push(account);
      store.superAdminId=id;store.version=Number(store.version)+1;saveStore(store);
      return json(res,200,{ok:true,version:store.version});
    }
    if(endpoint==='/api/login'&&req.method==='POST'){const input=await body(req),emp=store.db?.employees?.find(e=>String(e.id)===String(input.id)&&e.active!==false);if(!emp||String(emp.pass)!==String(input.pass))return json(res,401,{error:'invalid_credentials'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+SESSION_MS);return json(res,200,{ok:true,token,employee:{id:emp.id,role:emp.role}});}
    if(endpoint==='/api/logout'&&req.method==='POST'){sessions.delete(bearer(req));return json(res,200,{ok:true});}
    // Before the first seed is written the UI must be able to read the empty store.
    // Once initialized, every data and attachment operation requires a session.
    // Reading is needed before login because the original UI validates the employee
    // locally first. The service only listens on loopback; all mutations stay protected.
    if(endpoint==='/api/db'&&req.method==='GET')return json(res,200,store);
    if(store.db&&!authorized(req))return json(res,401,{error:'unauthorized'});
    if(endpoint==='/api/db'&&req.method==='PUT'){const input=await body(req);if(!input.db||typeof input.db!=='object')return json(res,400,{error:'invalid_db'});if(Number(input.version)!==Number(store.version))return json(res,409,{error:'version_conflict',version:store.version,db:store.db,updatedAt:store.updatedAt});const superAdminId=store.superAdminId||activeHr(store.db)?.id||activeHr(input.db)?.id;store={version:store.version+1,db:protectSuperAdmin(store.db,input.db,superAdminId),superAdminId,updatedAt:null};saveStore(store);return json(res,200,{ok:true,version:store.version,updatedAt:store.updatedAt});}
    if(endpoint==='/api/kv'){const key=url.searchParams.get('key');if(!key)return json(res,400,{error:'missing_key'});const file=keyFile(key);if(req.method==='GET')return json(res,200,{value:readJson(file,{value:null}).value});if(req.method==='PUT'){const input=await body(req);atomicWrite(file,JSON.stringify({key,value:input.value}));return json(res,200,{ok:true});}if(req.method==='DELETE'){try{fs.unlinkSync(file);}catch{}return json(res,200,{ok:true});}}
    if(endpoint==='/api/mail'&&req.method==='POST'){const input=await body(req),item={...input,createdAt:new Date().toISOString(),status:'local-only'};atomicWrite(path.join(outboxDir,`${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`),JSON.stringify(item));return json(res,200,{ok:true,queued:true,offline:true});}
    if(endpoint==='/api/outbox'&&req.method==='GET')return json(res,200,{items:fs.readdirSync(outboxDir).map(f=>readJson(path.join(outboxDir,f),null)).filter(Boolean)});
    if(endpoint==='/api/backup'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="hr-backup.json"'});return res.end(JSON.stringify(backupBundle(store)));}
    if(endpoint==='/api/restore'&&req.method==='POST'){
      const input=await body(req),restored=input?.format==='alsalman-hr-desktop-backup'?input.store:input;
      if(!restored?.db?.employees||!Array.isArray(restored.db.employees))return json(res,400,{error:'invalid_backup'});
      const previous=loadStore();atomicWrite(path.join(backupDir,`before-restore-${Date.now()}.json`),JSON.stringify(backupBundle(previous)));
      const superAdminId=previous.superAdminId||activeHr(previous.db)?.id||activeHr(restored.db)?.id;
      const next={version:Math.max(Number(previous.version)||0,Number(restored.version)||0)+1,db:protectSuperAdmin(previous.db,restored.db,superAdminId),superAdminId,updatedAt:null};saveStore(next);
      if(input?.format==='alsalman-hr-desktop-backup'&&Array.isArray(input.attachments)){
        for(const name of fs.readdirSync(kvDir))if(name.endsWith('.json'))fs.unlinkSync(path.join(kvDir,name));
        for(const item of input.attachments)if(/^[a-f0-9]{64}\.json$/.test(item.name)&&item.value)atomicWrite(path.join(kvDir,item.name),JSON.stringify(item.value));
      }
      return json(res,200,{ok:true,version:next.version,updatedAt:next.updatedAt});
    }
    return json(res,404,{error:'not_found'});
  }
  return new Promise((resolve,reject)=>{const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');Promise.resolve(url.pathname.startsWith('/api/')?api(req,res,url):serve(req,res,url)).catch(e=>json(res,e.message==='Payload too large'?413:400,{error:e.message}));});server.once('error',reject);server.listen(port,'127.0.0.1',()=>{const address=server.address();resolve({origin:`http://127.0.0.1:${address.port}/`,port:address.port,close:callback=>server.close(callback)});});});
}
module.exports={createLocalServer};
