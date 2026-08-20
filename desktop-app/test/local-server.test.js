'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {createLocalServer}=require('../src/local-server');
const {csvRole,applyEmployeeImport}=require('../src/public/employee-import');
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

test('CSV update without a role preserves a manager role and its permissions',()=>{
  const manager={id:'3001',name:'الاسم القديم',mobile:'0500000000',branch:'B1',role:'manager',permissions:{approve:true}};
  applyEmployeeImport(manager,{name:'الاسم الجديد',mobile:'0511111111',branch:'B2'},undefined);
  assert.deepEqual(manager,{id:'3001',name:'الاسم الجديد',mobile:'0511111111',branch:'B2',role:'manager',permissions:{approve:true}});
  applyEmployeeImport(manager,{name:'اسم أحدث'},'');
  assert.equal(manager.role,'manager');
  assert.deepEqual(manager.permissions,{approve:true});
});

test('CSV role labels map to every supported application role',()=>{
  assert.deepEqual(['موظف','مدير قسم','مدير فرع','موظف موارد بشرية','مدير الموارد البشرية','المدير العام'].map(csvRole),
    ['employee','manager','branch','hr_staff','hr','gm']);
  assert.equal(csvRole(undefined)||'employee','employee');
  const employee={role:'manager'};
  applyEmployeeImport(employee,{},'مدير الموارد البشرية');
  assert.equal(employee.role,'hr');
});

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
