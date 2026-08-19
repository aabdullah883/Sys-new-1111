'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function send(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>100*1024*1024)reject(Error('payload_too_large'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(Error('invalid_json'));}});req.on('error',reject);});}
function createInternalServer({dataDir,apiKey=process.env.INTERNAL_API_KEY||'',host='127.0.0.1',port=0}={}){
 if(!dataDir)throw Error('dataDir is required');if(String(apiKey).length<16)throw Error('INTERNAL_API_KEY must contain at least 16 characters');fs.mkdirSync(dataDir,{recursive:true});
 const storeFile=path.join(dataDir,'store.json'),historyFile=path.join(dataDir,'history.json'),attachmentsDir=path.join(dataDir,'attachments'),backupsDir=path.join(dataDir,'backups');fs.mkdirSync(attachmentsDir,{recursive:true});fs.mkdirSync(backupsDir,{recursive:true});
 const load=()=>read(storeFile,{version:0,sourceVersion:0,dirtySinceSource:false,updatedAt:null,db:null}),history=()=>read(historyFile,[]),keyFile=k=>path.join(attachmentsDir,crypto.createHash('sha256').update(String(k)).digest('hex')+'.json');
 function auth(req){return req.headers.authorization===`Bearer ${apiKey}`||req.headers['x-api-key']===apiKey;}
 function applied(id){return id&&history().some(item=>item.operation_id===id);}
 function record(item){const items=history();items.push({...item,at:new Date().toISOString()});atomic(historyFile,items.slice(-5000));}
 function save(next,operation){next.updatedAt=new Date().toISOString();atomic(storeFile,next);atomic(path.join(backupsDir,`store-${Date.now()}.json`),next);record(operation);}
 const server=http.createServer((req,res)=>{(async()=>{const url=new URL(req.url,'http://internal');const endpoint=url.pathname.replace(/\/$/,'');
  if(endpoint==='/api/ping')return send(res,200,{ok:true,service:'alsalman-hr-internal',version:load().version,updatedAt:load().updatedAt});
  if(!auth(req))return send(res,401,{error:'unauthorized'});
  if(endpoint==='/api/store'&&req.method==='GET')return send(res,200,load());
  if(endpoint==='/api/store'&&req.method==='PUT'){const input=await body(req),current=load();if(applied(input.operation_id))return send(res,200,{ok:true,duplicate:true,version:current.version});if(!input.db)return send(res,400,{error:'invalid_store'});if(Number(input.source_version)<Number(current.sourceVersion)||current.dirtySinceSource)return send(res,409,{error:'source_version_conflict',current});const next={version:current.version+1,sourceVersion:Number(input.source_version)||current.sourceVersion,dirtySinceSource:false,db:input.db};save(next,{operation_id:input.operation_id,action:'website_mirror',source_version:input.source_version});return send(res,200,{ok:true,version:next.version});}
  if(endpoint==='/api/sync'&&req.method==='POST'){const input=await body(req),current=load();if(applied(input.operation_id))return send(res,200,{ok:true,duplicate:true,version:current.version});if(Number(input.base_version)!==current.version)return send(res,409,{error:'version_conflict',current});if(!input.db)return send(res,400,{error:'invalid_operation'});const next={version:current.version+1,sourceVersion:current.sourceVersion,dirtySinceSource:true,db:input.db};save(next,{operation_id:input.operation_id,action:'desktop_update',base_version:input.base_version});return send(res,200,{ok:true,version:next.version});}
  if(endpoint==='/api/attachments'){const key=url.searchParams.get('key');if(!key)return send(res,400,{error:'missing_key'});const file=keyFile(key);if(req.method==='GET')return send(res,200,read(file,{key,value:null}));const input=['PUT','DELETE'].includes(req.method)?await body(req):{};if(applied(input.operation_id))return send(res,200,{ok:true,duplicate:true});if(req.method==='PUT')atomic(file,{key,value:input.value});else if(req.method==='DELETE')try{fs.unlinkSync(file);}catch{}else return send(res,405,{error:'method_not_allowed'});record({operation_id:input.operation_id,action:`attachment_${req.method.toLowerCase()}`,key});return send(res,200,{ok:true});}
  if(endpoint==='/api/backup'&&req.method==='GET')return send(res,200,{format:'alsalman-internal-backup',exportedAt:new Date().toISOString(),store:load(),attachments:fs.readdirSync(attachmentsDir).map(f=>read(path.join(attachmentsDir,f),null)).filter(Boolean)});
  if(endpoint==='/api/history'&&req.method==='GET')return send(res,200,{items:history()});
  return send(res,404,{error:'not_found'});
 })().catch(e=>send(res,e.message==='payload_too_large'?413:400,{error:e.message}));});
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolve({server,port:server.address().port,origin:`http://${host}:${server.address().port}`,close:cb=>server.close(cb)}));});
}
if(require.main===module)createInternalServer({dataDir:process.env.INTERNAL_DATA||path.join(__dirname,'data'),host:process.env.INTERNAL_HOST||'0.0.0.0',port:Number(process.env.INTERNAL_PORT)||3000}).then(x=>console.log(`Internal HR API listening on ${x.origin}/api`));
module.exports={createInternalServer};
