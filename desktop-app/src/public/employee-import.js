(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.EmployeeImport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const CSV_ROLES={
    'موظف':'employee',
    'مدير قسم':'manager',
    'مدير فرع':'branch',
    'موظف موارد بشرية':'hr_staff',
    'مدير الموارد البشرية':'hr',
    'المدير العام':'gm',
    employee:'employee',manager:'manager',branch:'branch',hr_staff:'hr_staff',hr:'hr',gm:'gm'
  };

  function csvRole(value){
    if(value===undefined||value===null) return null;
    return CSV_ROLES[String(value).trim()]||null;
  }

  function applyEmployeeImport(existing,values,roleValue){
    Object.assign(existing,values);
    const role=csvRole(roleValue);
    if(role) existing.role=role;
    return existing;
  }

  return {csvRole,applyEmployeeImport};
});
