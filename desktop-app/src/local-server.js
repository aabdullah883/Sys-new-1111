'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {RemoteSync}=require('./remote-sync');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const SESSION_MS=12*60*60*1000;
function atomicWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,value,{encoding:'utf8',mode:0o600});fs.renameSync(temp,file);}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>80*1024*1024)reject(new Error('Payload too large'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function bearer(req){if(req.headers['x-auth'])return req.headers['x-auth'];const match=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'');return match&&match[1];}
function createLocalServer({dataDir,publicDir,port=0,remoteBase=null,fetchImpl=globalThis.fetch}){
  fs.mkdirSync(dataDir,{recursive:true});const storeFile=path.join(dataDir,'store.json'),kvDir=path.join(dataDir,'kv'),backupDir=path.join(dataDir,'backups'),outboxDir=path.join(dataDir,'outbox');[kvDir,backupDir,outboxDir].forEach(d=>fs.mkdirSync(d,{recursive:true}));
  const sessions=new Map(),loadStore=()=>readJson(storeFile,{version:0,db:null,updatedAt:null});
  const modeFile=path.join(dataDir,'desktop-mode.json');
  const remote=remoteBase?new RemoteSync({dataDir,remoteBase,fetchImpl}):null;
  const getMode=()=>remote?readJson(modeFile,{mode:'online'}).mode:'local';
  const setMode=mode=>atomicWrite(modeFile,JSON.stringify({mode}));
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
  function session(req){const token=bearer(req),value=sessions.get(token);if(!value||value.expires<Date.now()){if(token)sessions.delete(token);return null;}return value;}
  function authorized(req){return !!session(req);}
  function serve(req,res,url){const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');const root=path.resolve(publicDir),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return json(res,403,{error:'forbidden'});try{if(!fs.statSync(file).isFile())throw new Error();res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':rel==='index.html'?'no-store':'public, max-age=86400'});fs.createReadStream(file).pipe(res);}catch{json(res,404,{error:'not_found'});}}
  async function api(req,res,url){const endpoint=url.pathname.replace(/\.php$/,'');let store=loadStore();
    if(endpoint==='/api/ping'&&req.method==='GET'){
      let online=false,remoteInfo=null;if(remote&&getMode()==='online')try{remoteInfo=await remote.ping();online=true;}catch{}
      return json(res,200,{ok:true,initialized:!!store.db,version:store.version,updatedAt:store.updatedAt,desktop:true,remote:true,mode:getMode(),online,remoteInfo,pending:remote?remote.queue().length:0,conflicts:remote?remote.conflicts().length:0});
    }
    if(endpoint==='/api/mode'&&req.method==='GET')return json(res,200,{mode:getMode(),remoteAvailable:!!remote});
    if(endpoint==='/api/login'&&req.method==='POST'){
      const input=await body(req);let remoteToken=null,offline=false;
      if(remote&&getMode()==='online'){
        try{const result=await remote.login(input);if(!result.ok)return json(res,result.status,result.result);remoteToken=result.result.token;}catch{offline=true;}
      }
      const emp=store.db?.employees?.find(e=>String(e.id)===String(input.id)&&e.active!==false);
      if((!remoteToken)&&(!emp||String(emp.pass)!==String(input.pass)))return json(res,offline?503:401,{error:offline?'offline_login_unavailable':'invalid_credentials'});
      const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+SESSION_MS,remoteToken,offline});
      if(remoteToken)try{await remote.flush(remoteToken);const pulled=await remote.pull(remoteToken);store={version:pulled.version,db:pulled.db,updatedAt:pulled.updatedAt};saveStore(store);}catch{}
      const current=store.db?.employees?.find(e=>String(e.id)===String(input.id))||emp;
      return json(res,200,{ok:true,token,offline,employee:{id:current?.id||input.id,role:current?.role||''}});
    }
    if(endpoint==='/api/logout'&&req.method==='POST'){const active=session(req);if(remote&&active?.remoteToken)try{await remote.request('logout.php',{method:'POST',headers:remote.headers(active.remoteToken)});}catch{}sessions.delete(bearer(req));return json(res,200,{ok:true});}
    // Before the first seed is written the UI must be able to read the empty store.
    // Once initialized, every data and attachment operation requires a session.
    // Reading is needed before login because the original UI validates the employee
    // locally first. The service only listens on loopback; all mutations stay protected.
    if(endpoint==='/api/db'&&req.method==='GET'){
      const active=session(req);if(remote&&getMode()==='online'&&active?.remoteToken)try{await remote.flush(active.remoteToken);const pulled=await remote.pull(active.remoteToken);store={version:pulled.version,db:pulled.db,updatedAt:pulled.updatedAt};saveStore(store);}catch{}
      let responseStore=store;
      if(remote&&getMode()==='online'&&!active&&store.db){responseStore={...store,db:{...store.db,employees:(store.db.employees||[]).map(({pass,...employee})=>employee)}};}
      return json(res,200,{...responseStore,offline:!!(remote&&getMode()==='online'&&!active?.remoteToken),pending:remote?remote.queue().length:0,conflicts:remote?remote.conflicts().length:0});
    }
    if(store.db&&!authorized(req))return json(res,401,{error:'unauthorized'});
    if(endpoint==='/api/mode'&&req.method==='PUT'){const input=await body(req);if(!['online','local'].includes(input.mode)||(!remote&&input.mode==='online'))return json(res,400,{error:'invalid_mode'});setMode(input.mode);return json(res,200,{ok:true,mode:input.mode});}
    if(endpoint==='/api/db'&&req.method==='PUT'){const input=await body(req);if(!input.db||typeof input.db!=='object')return json(res,400,{error:'invalid_db'});if(Number(input.version)!==Number(store.version))return json(res,409,{error:'version_conflict',version:store.version,db:store.db,updatedAt:store.updatedAt});const active=session(req);store={version:store.version+1,db:input.db,updatedAt:null};saveStore(store);let queued=false;if(remote&&getMode()==='online'&&active){remote.enqueueDatabase(input.db);queued=true;if(active.remoteToken){const sync=await remote.flush(active.remoteToken);queued=!!sync.pending;if(sync.conflicts)return json(res,409,{error:'sync_conflict',version:store.version,db:store.db,conflicts:sync.conflicts});}}return json(res,200,{ok:true,version:store.version,updatedAt:store.updatedAt,queued});}
    if(endpoint==='/api/kv'){
      const key=url.searchParams.get('key');if(!key)return json(res,400,{error:'missing_key'});const file=keyFile(key),active=session(req);
      if(req.method==='GET'){
        if(remote&&getMode()==='online'&&active?.remoteToken)try{const response=await remote.request(`kv.php?key=${encodeURIComponent(key)}`,{headers:remote.headers(active.remoteToken)});if(response.ok){const result=await response.json();atomicWrite(file,JSON.stringify({key,value:result.value}));}}catch{}
        return json(res,200,{value:readJson(file,{value:null}).value});
      }
      if(req.method==='PUT'){const input=await body(req);atomicWrite(file,JSON.stringify({key,value:input.value}));if(remote&&getMode()==='online'){remote.enqueueKv(key,input.value);if(active?.remoteToken)await remote.flush(active.remoteToken);}return json(res,200,{ok:true,queued:!!(remote&&remote.queue().length)});}
      if(req.method==='DELETE'){try{fs.unlinkSync(file);}catch{}if(remote&&getMode()==='online'){remote.enqueueKv(key,null,'DELETE');if(active?.remoteToken)await remote.flush(active.remoteToken);}return json(res,200,{ok:true,queued:!!(remote&&remote.queue().length)});}
    }
    if(endpoint==='/api/sync'&&req.method==='POST'){const active=session(req);if(!remote||!active?.remoteToken)return json(res,503,{error:'remote_session_unavailable'});return json(res,200,await remote.flush(active.remoteToken));}
    if(endpoint==='/api/conflicts'&&req.method==='GET')return json(res,200,{items:remote?remote.conflicts():[]});
    if(endpoint==='/api/mail'&&req.method==='POST'){const input=await body(req),item={...input,createdAt:new Date().toISOString(),status:'local-only'};atomicWrite(path.join(outboxDir,`${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`),JSON.stringify(item));return json(res,200,{ok:true,queued:true,offline:true});}
    if(endpoint==='/api/outbox'&&req.method==='GET')return json(res,200,{items:fs.readdirSync(outboxDir).map(f=>readJson(path.join(outboxDir,f),null)).filter(Boolean)});
    if(endpoint==='/api/backup'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="hr-backup.json"'});return res.end(JSON.stringify(backupBundle(store)));}
    if(endpoint==='/api/restore'&&req.method==='POST'){
      const input=await body(req),restored=input?.format==='alsalman-hr-desktop-backup'?input.store:input;
      if(!restored?.db?.employees||!Array.isArray(restored.db.employees))return json(res,400,{error:'invalid_backup'});
      const previous=loadStore();atomicWrite(path.join(backupDir,`before-restore-${Date.now()}.json`),JSON.stringify(backupBundle(previous)));
      const next={version:Math.max(Number(previous.version)||0,Number(restored.version)||0)+1,db:restored.db,updatedAt:null};saveStore(next);
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
