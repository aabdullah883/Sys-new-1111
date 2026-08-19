'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {createLocalServer}=require('../src/local-server');
const {createInternalServer}=require('../../internal-server/server');
const publicDir=path.join(__dirname,'..','src','public');

async function request(origin,route,options={}){
  const response=await fetch(new URL(route,origin),options);
  const text=await response.text();
  let data=text;
  try{data=text?JSON.parse(text):null;}catch{}
  return {status:response.status,data,headers:response.headers};
}
function jsonOptions(method,value,token){
  const headers={'content-type':'application/json'};
  if(token)headers['x-auth']=token;
  return {method,headers,body:value===undefined?undefined:JSON.stringify(value)};
}
function completeDatabase(){
  return {
    employees:[
      {id:'1005807605',iqama:'1005807605',name:'مدير الموارد البشرية',pass:'12345',role:'hr',active:true},
      {id:'2001',iqama:'2001',name:'موظف',pass:'employee-pass',role:'employee',active:true}
    ],
    branches:[{id:'B1',name:'الإدارة العامة'}],depts:['الموارد البشرية','تقنية المعلومات'],
    tasks:[{id:'T1',title:'مهمة اختبار',status:'open',assignee:'2001'}],
    requests:[{id:'R1',type:'leave',empId:'2001',status:'pending'}],
    att:{'2001:2026-08-18':{in:'08:00',out:'17:00'}},
    docs:[{id:'D1',type:'سجل تجاري'}],archive:{employees:[],requests:[{id:'AR1',empId:'2001'}],chats:[],messages:[]},
    reports:[{id:'REP1'}],settings:{perms:{hr:{addEmp:true,editEmp:true,deleteEmp:true,archive:true,tasksAdmin:true,reports:true},employee:{addEmp:false,editEmp:false,deleteEmp:false}}}
  };
}
async function login(server,id='1005807605',pass='12345'){
  return request(server.origin,'api/login.php',jsonOptions('POST',{id,pass}));
}

test('serves the complete original Arabic RTL UI without PHP or MySQL',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-desktop-ui-'));
  const server=await createLocalServer({dataDir,publicDir});
  try{
    const page=await fetch(server.origin),html=await page.text();
    assert.equal(page.status,200);assert.match(html,/<html[^>]+dir="rtl"/i);
    for(const label of ['الموظف','المهام','المعاملات','الحضور','الأرشيف','التقارير','الصلاحيات'])assert.ok(html.includes(label),`missing UI feature: ${label}`);
    assert.equal((await request(server.origin,'api/ping.php')).data.desktop,true);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('login, employee CRUD state, departments, tasks, requests, attendance, archive, reports and permissions persist after restart',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-desktop-persist-'));
  let server=await createLocalServer({dataDir,publicDir});
  const db=completeDatabase();
  try{
    assert.equal((await request(server.origin,'api/db.php')).data.db,null);
    assert.equal((await request(server.origin,'api/db.php',jsonOptions('PUT',{version:0,db}))).status,200);
    assert.equal((await login(server,'2001','wrong')).status,401);
    const auth=await login(server);assert.equal(auth.status,200);
    assert.equal((await request(server.origin,'api/db.php',jsonOptions('PUT',{version:1,db},'bad-token'))).status,401);
    db.employees.push({id:'3001',name:'موظف جديد',pass:'x',role:'employee',active:true});
    db.employees.find(e=>e.id==='3001').name='موظف معدل';
    db.employees=db.employees.filter(e=>e.id!=='2001');
    db.depts.push('التشغيل');db.tasks[0].status='done';db.requests[0].status='completed';db.att['3001:2026-08-18']={in:'08:05',out:'17:10'};db.archive.employees.push({id:'2001'});db.reports.push({id:'REP2'});
    const saved=await request(server.origin,'api/db.php',jsonOptions('PUT',{version:1,db},auth.data.token));assert.equal(saved.data.version,2);
    assert.equal((await request(server.origin,'api/db.php',jsonOptions('PUT',{version:1,db},auth.data.token))).status,409);
  }finally{await new Promise(resolve=>server.close(resolve));}
  server=await createLocalServer({dataDir,publicDir});
  try{
    const auth=await login(server),result=await request(server.origin,'api/db.php',{headers:{'x-auth':auth.data.token}}),saved=result.data.db;
    assert.equal(saved.employees.some(e=>e.id==='2001'),false);assert.equal(saved.employees.find(e=>e.id==='3001').name,'موظف معدل');
    assert.ok(saved.depts.includes('التشغيل'));assert.equal(saved.tasks[0].status,'done');assert.equal(saved.requests[0].status,'completed');
    assert.equal(saved.att['3001:2026-08-18'].out,'17:10');assert.equal(saved.archive.employees[0].id,'2001');assert.equal(saved.reports.length,2);
    assert.equal(saved.settings.perms.hr.deleteEmp,true);assert.equal(saved.settings.perms.employee.deleteEmp,false);
    assert.ok(fs.readdirSync(path.join(dataDir,'backups')).length>=1);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('attachments, complete backup and restore survive data changes',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-desktop-backup-'));
  const server=await createLocalServer({dataDir,publicDir});
  try{
    const db=completeDatabase();await request(server.origin,'api/db.php',jsonOptions('PUT',{version:0,db}));
    const auth=await login(server),token=auth.data.token,key='hrsys:photo:2001',original='data:image/png;base64,QUJD';
    await request(server.origin,`api/kv.php?key=${encodeURIComponent(key)}`,jsonOptions('PUT',{value:original},token));
    const backup=await request(server.origin,'api/backup.php',{headers:{'x-auth':token}});assert.equal(backup.data.format,'alsalman-hr-desktop-backup');assert.equal(backup.data.attachments.length,1);
    db.tasks=[];await request(server.origin,'api/db.php',jsonOptions('PUT',{version:1,db},token));
    await request(server.origin,`api/kv.php?key=${encodeURIComponent(key)}`,jsonOptions('PUT',{value:'changed'},token));
    const restored=await request(server.origin,'api/restore.php',jsonOptions('POST',backup.data,token));assert.equal(restored.status,200);
    const current=await request(server.origin,'api/db.php',{headers:{'x-auth':token}});assert.equal(current.data.db.tasks.length,1);
    const attachment=await request(server.origin,`api/kv.php?key=${encodeURIComponent(key)}`,{headers:{'x-auth':token}});assert.equal(attachment.data.value,original);
    assert.ok(fs.readdirSync(path.join(dataDir,'backups')).some(name=>name.startsWith('before-restore-')));
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('EXE bridges website data to internal server, queues outages, deduplicates and records conflicts',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-desktop-bridge-')),internalDir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-internal-'));
  let internal=await createInternalServer({dataDir:internalDir,apiKey:'bridge-secret-key-123456',adminPassword:'dashboard-test-password'});
  const website={online:true,version:5,db:completeDatabase()};
  const fetchImpl=async(url,options={})=>{
    const parsed=new URL(url);
    if(parsed.hostname!=='hr-alsalman.com')return fetch(url,options);
    if(!website.online)throw new TypeError('website offline');
    const endpoint=parsed.pathname.split('/').pop(),method=options.method||'GET';
    if(endpoint==='ping.php')return Response.json({ok:true,initialized:true,version:website.version});
    if(endpoint==='login.php')return Response.json({token:'remote-token',id:'1005807605',role:'hr'});
    if(endpoint==='db.php'&&method==='GET')return Response.json({version:website.version,db:website.db,updatedAt:'2026-08-19T00:00:00Z'});
    return Response.json({ok:true,value:null});
  };
  const server=await createLocalServer({dataDir,publicDir,remoteBase:'https://hr-alsalman.com/api/',fetchImpl});
  let internalPort=internal.port;
  try{
    const auth=await login(server),token=auth.data.token;assert.equal(auth.status,200);
    await request(server.origin,'api/bridge/config.php',jsonOptions('PUT',{url:`http://127.0.0.1:${internalPort}/api`,apiKey:'bridge-secret-key-123456'},token));
    let sync=await request(server.origin,'api/sync.php',jsonOptions('POST',{},token));assert.equal(sync.status,200);
    let mirrored=await fetch(`http://127.0.0.1:${internalPort}/api/store`,{headers:{'x-api-key':'bridge-secret-key-123456'}}).then(r=>r.json());assert.equal(mirrored.sourceVersion,5);assert.equal(mirrored.db.employees.length,2);
    website.online=false;let cached=await request(server.origin,'api/db.php',{headers:{'x-auth':token}});cached.data.db.tasks.push({id:'INTERNAL-EDIT'});
    await request(server.origin,'api/db.php',jsonOptions('PUT',{version:5,db:cached.data.db},token));
    mirrored=await fetch(`http://127.0.0.1:${internalPort}/api/store`,{headers:{'x-api-key':'bridge-secret-key-123456'}}).then(r=>r.json());assert.ok(mirrored.db.tasks.some(t=>t.id==='INTERNAL-EDIT'));
    await new Promise(ok=>internal.close(ok));internal=null;cached=await request(server.origin,'api/db.php',{headers:{'x-auth':token}});cached.data.db.tasks.push({id:'QUEUED-EDIT'});
    const queued=await request(server.origin,'api/db.php',jsonOptions('PUT',{version:6,db:cached.data.db},token));assert.equal(queued.data.queued,true);
    internal=await createInternalServer({dataDir:internalDir,apiKey:'bridge-secret-key-123456',adminPassword:'dashboard-test-password',port:internalPort});
    sync=await request(server.origin,'api/sync.php',jsonOptions('POST',{},token));assert.equal(sync.data.synced,1);
    sync=await request(server.origin,'api/sync.php',jsonOptions('POST',{},token));assert.equal(sync.data.synced,0);
    mirrored=await fetch(`http://127.0.0.1:${internalPort}/api/store`,{headers:{'x-api-key':'bridge-secret-key-123456'}}).then(r=>r.json());assert.ok(mirrored.db.tasks.some(t=>t.id==='QUEUED-EDIT'));
    cached=await request(server.origin,'api/db.php',{headers:{'x-auth':token}});
    const external={...mirrored,db:{...mirrored.db,tasks:[...mirrored.db.tasks,{id:'EXTERNAL-INTERNAL'}]}};
    await fetch(`http://127.0.0.1:${internalPort}/api/sync`,{method:'POST',headers:{'content-type':'application/json','x-api-key':'bridge-secret-key-123456'},body:JSON.stringify({operation_id:'external-op',base_version:mirrored.version,db:external.db})});
    cached.data.db.tasks.push({id:'CONFLICT-LOCAL'});await request(server.origin,'api/db.php',jsonOptions('PUT',{version:7,db:cached.data.db},token));
    const conflicts=await request(server.origin,'api/conflicts.php',{headers:{'x-auth':token}});assert.ok(conflicts.data.items.some(c=>c.local.db?.tasks.some(t=>t.id==='CONFLICT-LOCAL')));
  }finally{await new Promise(ok=>server.close(ok));if(internal)await new Promise(ok=>internal.close(ok));fs.rmSync(dataDir,{recursive:true,force:true});fs.rmSync(internalDir,{recursive:true,force:true});}
});
