const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };
const vm = require('vm');
must(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'stable date-reset fingerprint fix version metadata missing');
must(html.includes('id="dailyBusinessResetDate" type="date"'), 'Admin must be able to choose a date');
must(html.includes('function previewDailyBusinessReset()') && html.includes('function executeDailyBusinessReset()'), 'date-selectable preview/execute UI missing');
must(html.includes('function resetValidBusinessDate(value)'), 'calendar dates must be validated');
must(html.includes('function normalizeResetTracking(value)'), 'reset tracking normalizer must be defined at runtime');
must(html.includes("D.dailyShipmentReports=(Array.isArray(D.dailyShipmentReports)?D.dailyShipmentReports:[]).filter(r=>!(String(r?.date||'')===date&&dailyShipmentIsScanDerivedReport(r)))"), 'post-reset UI cache cleanup must use the global helper, not closure-private isTargetDailyShipmentReport');
const globalExecuteStart = html.indexOf('async function executeDailyBusinessReset()');
const globalExecuteEnd = html.indexOf('function dailyShipmentMergeCachedRows', globalExecuteStart);
must(globalExecuteStart >= 0 && globalExecuteEnd > globalExecuteStart, 'global reset execute handler block missing');
must(!html.slice(globalExecuteStart, globalExecuteEnd).includes('isTargetDailyShipmentReport('), 'global UI must not call closure-private isTargetDailyShipmentReport');
const normalizeStart = html.indexOf('function normalizeResetTracking(value)');
const normalizeEnd = html.indexOf('function isTargetDailyShipmentReport', normalizeStart);
must(normalizeStart >= 0 && normalizeEnd > normalizeStart, 'reset normalizer source block is missing');
const normalizeSandbox = {};
vm.runInNewContext(html.slice(normalizeStart, normalizeEnd) + '; this.normalizer = normalizeResetTracking;', normalizeSandbox);
must(normalizeSandbox.normalizer(' 86-25 634-68948 ') === '862563468948', 'reset normalizer must canonicalize formatted tracking IDs');
must(normalizeSandbox.normalizer('VNGH-80806190415') === 'VNGH80806190415', 'reset normalizer must preserve carrier tracking letters and digits');
must(html.includes("if(String(confirmationText||'').trim()!==expectedPhrase)"), 'date-specific destructive confirmation guard missing');
must(html.includes("db.collection('dailyShipmentScans').where('date','==',date)"), 'scan scope must be restricted to the selected date');
must(html.includes("resetDailyRowsForDate(appData.daily,date)"), 'manual inventory/payroll records must be scoped to the selected date');
must(html.includes('resetTargetPdfRows(appData.dailyShipmentOrders,date)'), 'PDF queue deletion must be date-scoped');
must(html.includes('resetCompletedOrderOnDate'), 'completed-order deletion must be date-scoped');
must(html.includes("k.startsWith(String(date)+'|')"), 'payroll settlements must be date-scoped');
must(html.includes('nextData.payrollArchives=(Array.isArray(appData.payrollArchives)?appData.payrollArchives:[]).filter(r=>String(r?.date||\'\')!==date)'), 'payroll archive removal must match the selected day only');
must(html.includes('if(protectedBase&&String(date)<=protectedBase)') || html.includes("if(protectedBase&&String(date)<=protectedBase)"), 'reset must block dates already folded into the stock baseline');
must(html.includes('resetBusinessConfirmPhrase(date)'), 'date-specific confirmation phrase missing');
must(html.includes('dailyShipmentResetAudit') && html.includes("scope:'full_business_day'"), 'date reset audit entry must be preserved');
must(html.includes('dailyShipmentResetDates') && html.includes('dailyShipmentApplyResetMarkers'), 'stale cache guard must remain');
must(rules.includes('match /dailyShipmentScans/{trackingNo}') && rules.includes('allow delete: if isAdmin();'), 'existing Admin scan-delete rule not available');
must(rules.includes('match /packingOrders/{orderId}') && rules.includes('allow delete: if isAdmin();'), 'existing Admin completed-order delete rule not available');
// The signature excludes volatile synchronization timestamps but includes date-scoped data.
must(html.includes("if(['updatedAt','updatedAtMs','lastSeenAtMs','syncedAtMs'].includes(k))return;"), 'fingerprint should exclude volatile sync metadata');
must(html.includes('D.stockBaseDate') || html.includes('appData.stockBaseDate'), 'stock baseline safety check missing');
must(html.includes('Dữ liệu ngày khác được giữ lại'), 'reset must state that other dates are preserved');
// Cache regression: old rows before marker disappear/reset, a fresh scan remains visible.
const helperStart = html.indexOf('function dailyShipmentDateWasReset(date)');
const helperEnd = html.indexOf('async function previewDailyShipmentReset18()', helperStart);
must(helperStart >= 0 && helperEnd > helperStart, 'date-reset cache marker helper block missing');
const sandbox = { normalizeTracking: value => String(value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase(), D: { dailyShipmentResetDates: { '2026-10-18': 1000 }, dailyShipmentReports: [
 { id:'daily_old', trackingNo:'OLD', date:'2026-10-18', source:'daily_shipment_scan', status:'recorded', scannedAtMs:900 },
 { id:'daily_new', trackingNo:'NEW', date:'2026-10-18', source:'daily_shipment_scan', status:'recorded', scannedAtMs:1100 },
 { id:'daily_other', trackingNo:'OTHER', date:'2026-10-17', source:'daily_shipment_scan', status:'recorded', scannedAtMs:800 }
 ], dailyShipmentOrders:[
 { trackingNo:'OLD', date:'2026-10-18', source:'pdf_label', status:'recorded', recordedAtMs:900, employee:'Old employee' },
 { trackingNo:'NEW', date:'2026-10-18', source:'pdf_label', status:'recorded', recordedAtMs:1100, employee:'New employee' }
 ] }, invalidateInventoryIndexes() {} };
vm.runInNewContext(html.slice(helperStart, helperEnd) + `this.testMarker=()=>{dailyShipmentApplyResetMarkers();return {reports:D.dailyShipmentReports,orders:D.dailyShipmentOrders};};`,sandbox);
const out=sandbox.testMarker();must(out.reports.length===2&&out.reports.some(r=>r.trackingNo==='NEW')&&out.reports.some(r=>r.trackingNo==='OTHER'),'reset marker must preserve fresh scans and other dates');
must(!out.orders.some(r=>r.trackingNo==='OLD'),'clear tombstone must remove stale deleted labels instead of restoring them');
must(out.orders.find(r=>r.trackingNo==='NEW').status==='recorded','new scans after reset must remain visible');
console.log('Daily business date-reset regression test PASS');

// Fingerprint should focus on the selected date's actual deletion scope. Editing an unfinished order
// or unrelated claim metadata must not cause false mismatch; target completion/claim ownership must.
const signatureStart = html.indexOf('function resetPreviewSignature(');
const signatureEnd = html.indexOf('async function collectDailyBusinessResetSnapshot', signatureStart);
must(signatureStart >= 0 && signatureEnd > signatureStart, 'reset signature function block missing');
const sigSandbox = {
  resetDailyRowsForDate: (rows,date) => (Array.isArray(rows)?rows:[]).filter(r=>String(r?.date||'')===String(date)),
  resetTargetPdfRows: (rows,date) => (Array.isArray(rows)?rows:[]).filter(r=>String(r?.date||'')===String(date)),
  resetTargetShipmentReports: (rows,date) => (Array.isArray(rows)?rows:[]).filter(r=>r&&String(r.date||'')===String(date)&&(r.scanStore==='dailyShipmentScans'||r.source==='daily_shipment_scan'||String(r.id||'').startsWith('daily_'))),
  resetCompletedOrderOnDate: (row,date) => !!row && String(row.status||'').toLowerCase()==='completed' && String(row.completedDate||row.date||'')===String(date),
  completedOrderDate: row => row?.completedDate||'',
  resetCleanForSignature: value => {
    if(Array.isArray(value))return value.map(sigSandbox.resetCleanForSignature);
    if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{if(['updatedAt','updatedAtMs','lastSeenAtMs','syncedAtMs'].includes(k))return;const v=value[k];if(v!==undefined)out[k]=sigSandbox.resetCleanForSignature(v)});return out}
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    return value===undefined?null:value;
  },
  resetStableJson: value => JSON.stringify(sigSandbox.resetCleanForSignature(value))
};
vm.runInNewContext(html.slice(signatureStart,signatureEnd)+';this.signature=resetPreviewSignature;',sigSandbox);
const targetDate='2026-10-18';
const orderUnfinished={id:'pending1',data:()=>({status:'pending',date:targetDate,assignedUid:'a'})};
const claim={tracking:'TRACK1',exists:true,data:{orderId:'order1',source:'packing_order',claimedAtMs:1,metadataTick:1}};
const sigApp={stockBaseDate:'',daily:[],salaryAdvances:[],shipments:[],dailyShipmentOrders:[],dailyShipmentReports:[],payrollArchives:[],retentionState:{warningAtByDate:{[targetDate]:10},pendingPayrollRetentionDates:[]},payrollSettlements:{},packingOrders:[],packerRecords:[]};
const sig1=sigSandbox.signature(targetDate,sigApp,[],[claim],[orderUnfinished]);
orderUnfinished.data=()=>({status:'pending',date:targetDate,assignedUid:'b',updatedAtMs:Date.now()});
claim.data.metadataTick=2;claim.data.claimedAtMs=99;sigApp.retentionState.warningAtByDate[targetDate]=999;
const sig2=sigSandbox.signature(targetDate,sigApp,[],[claim],[orderUnfinished]);
must(sig1===sig2,'irrelevant unfinished-order/cache/claim-warning changes should not invalidate reset fingerprint');
orderUnfinished.data=()=>({status:'completed',completedDate:targetDate,date:targetDate,assignedUid:'b'});
const sig3=sigSandbox.signature(targetDate,sigApp,[],[claim],[orderUnfinished]);
must(sig3!==sig2,'a new completed order in the selected date must invalidate the fingerprint');
claim.data.orderId='different-owner';
const sig4=sigSandbox.signature(targetDate,sigApp,[],[claim],[orderUnfinished]);
must(sig4!==sig3,'claim ownership changes must invalidate the fingerprint');
