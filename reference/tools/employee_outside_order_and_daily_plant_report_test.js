const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');

assert(html.includes("function isEmployeeOutsideOrder(r){return isOutsideTikTokOrder(r)||String(r?.orderType||'').trim().toUpperCase()==='ĐN'}"), 'outside order classifier must cover explicit ĐN orders and outside metadata');
assert(html.includes("['outside','🌱 Đơn ngoài',activeRows.filter(isEmployeeOutsideOrder).length]"), 'employee list must include an explicit outside-order filter');
assert(html.includes("packerOrderFilter==='outside'?pendingMine.filter(isEmployeeOutsideOrder)"), 'outside filter must actually filter employee orders');
assert(html.includes('const liveRows=[...(Array.isArray(D.packingOrders)?D.packingOrders:[]),...(Array.isArray(orderNotificationState.rows)?orderNotificationState.rows:[])]') && html.includes('const sourceList=liveRows.length?liveRows:(uid?restorePackerOrderCache(uid):[])'), 'employee list must merge current app/realtime rows and use local cache only offline');
assert(html.includes("const uid=String(st?.user?.uid||orderNotificationState.uid||'').trim()"), 'authenticated UID must take precedence over stale UI UID');
assert(html.includes('function currentPackerCompletedRows(inputRows)') && html.includes('uidCandidates.includes(uid)'), 'employee report must be scoped to current account assignments');
assert(html.includes('function aggregateCompletedOrderPlants(rows)') && html.includes('orderItemRate(item,items)'), 'daily plant summary must aggregate item quantity and wage by plant/size');
assert(html.includes('packerDailyPlantWageSummary') && html.includes('Số cây & tiền công theo loại/size') && html.includes('Tổng tiền công trong ngày'), 'daily view must show plant breakdown and exact daily wage');
assert(html.includes('packerReportOwnSummary') && html.includes('Tiền công & sản lượng từng ngày') && html.includes('dayRows.reduce((sum,r)=>sum+packerPay(r),0)'), 'employee report must show total daily wages per day');

const start = html.indexOf('function currentPackerCompletedRows(inputRows){');
const end = html.indexOf('\nfunction rowsByName(name){', start);
assert(start >= 0 && end > start, 'employee report helpers must be extractable');
const helpers = html.slice(start, end);
const state = { role:'packer', user:{uid:'staff-a'}, profile:{employeeId:'E-A',employeeName:'Lan'} };
const catalog = [{name:'Cẩm tú mai',size:'C9'},{name:'Nguyệt quế Thái',size:'C7'}];
const sandbox = {
  window:{CloudSync:{state:()=>state}}, CloudSync:{state:()=>state}, orderNotificationState:{uid:'staff-a'},
  D:{catalog}, currentPackerName:()=> 'Lan', wageNormalizeText:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ').trim(),
  orderItems:r=>Array.isArray(r.items)?r.items:[], orderItemRate:item=>item.assignedRate??(item.size==='C9'?2500:2000),
  esc:v=>String(v), money:v=>String(Math.round(Number(v)||0))
};
vm.createContext(sandbox); vm.runInContext(helpers,sandbox,{timeout:1000});
const rows=[
  {id:'own',status:'completed',assignedUid:'staff-a',employee:'Lan',employeeId:'E-A',items:[{plantIndex:0,plantName:'Cẩm tú mai',size:'C9',qty:2,assignedRate:2500}]},
  {id:'other',status:'completed',assignedUid:'staff-b',employee:'Nam',employeeId:'E-B',items:[{plantIndex:1,plantName:'Nguyệt quế Thái',size:'C7',qty:9,assignedRate:2000}]},
  {id:'pending',status:'pending',assignedUid:'staff-a',employee:'Lan',items:[{plantIndex:1,plantName:'Nguyệt quế Thái',size:'C7',qty:1,assignedRate:2000}]}
];
const own=sandbox.currentPackerCompletedRows(rows);
assert.strictEqual(own.length,1,'only current employee completed orders are reportable');
assert.strictEqual(own[0].id,'own');
const totals=sandbox.aggregateCompletedOrderPlants(own);
assert.strictEqual(totals.length,1); assert.strictEqual(totals[0].plantName,'Cẩm tú mai'); assert.strictEqual(totals[0].qty,2); assert.strictEqual(totals[0].basePay,5000);
console.log('EMPLOYEE OUTSIDE ORDER & DAILY PLANT REPORT TEST PASS');
