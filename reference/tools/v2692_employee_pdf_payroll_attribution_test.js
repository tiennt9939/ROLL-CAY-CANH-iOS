'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
const preflight=fs.readFileSync(path.join(root,'tools/preflight.py'),'utf8');
assert(gradle.includes('versionName = "26.2.92"')&&gradle.includes('versionCode = 144'),'V26.2.92 metadata must be set');
assert(preflight.includes('versionName = "26.2.92"')&&preflight.includes('versionCode = 144'),'preflight must match V26.2.92');
const start=html.indexOf('function currentPackerCompletedRows(inputRows){');
const end=html.indexOf('\nfunction aggregateCompletedOrderPlants(rows){',start);
assert(start>=0&&end>start,'employee report row filter must exist');
const source=html.slice(start,end);
const ctx={
  window:{CloudSync:{state:()=>({role:'packer',user:{uid:'uid-huy'},profile:{employeeId:'emp-42',employeeName:'Huy'}})}},
  orderNotificationState:{uid:'uid-huy'},
  currentPackerName:()=> 'Huy',
  wageNormalizeText:v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ').trim(),
  String,Array,
};
vm.runInNewContext(source,ctx,{filename:'currentPackerCompletedRows.js'});
const rows=[
 {id:'daily_pdf_1',status:'completed',dailyShipment:true,employee:'Huy',employeeId:'Huy',adminDelegateAssignedUid:'uid-huy'},
 {id:'daily_pdf_2',status:'completed',dailyShipment:true,employee:'Luân lớn',employeeId:'Luân lớn',adminDelegateAssignedUid:'uid-luan'},
 {id:'outside_1',status:'completed',employee:'Huy',assignedUid:'uid-huy'},
];
const result=ctx.currentPackerCompletedRows(rows);
assert.deepStrictEqual(Array.from(result,x=>x.id),['daily_pdf_1','outside_1'],'employee report must include PDF scan delegated to this employee and outside orders assigned to them, but exclude other staff');
console.log('V26.2.92 EMPLOYEE PDF PAYROLL ATTRIBUTION TEST PASS');
