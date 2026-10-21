const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');

assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'V26.2.92 metadata required');
assert(workflow.includes('V26.2.92') && workflow.includes('*AUTO-UPDATE-SOURCE.zip'), 'source auto-build workflow must still watch source ZIP');
assert(html.includes('openAdminOutsideOrderPhotoCompletion') && html.includes('ADMIN CHỤP ẢNH & HOÀN TẤT'), 'Admin must have an explicit outside-order photo-completion action');
assert(html.includes("pendingAdminOrderType='ĐN'") && html.includes("verificationMethod:'admin_outside_photo'"), 'outside Admin photo mode must avoid TikTok OCR');
assert(html.includes("onchange=\"readAdminOrderProof(event,0)\"") && html.includes("capture=\"environment\""), 'Admin photo action must capture one camera image');
assert(html.includes("await CloudSync.state().adminCompletePackingOrder(id,photos,sh)"), 'photo flow must use canonical completion operation');
assert(html.includes("}else if(type==='ĐN'){\n      await ref.update({status:'completed'") && html.includes("completedBy:String(old.assignedUid||user.uid),completionRecordedBy:user.uid"), 'Firestore completion must retain the assigned employee as wage recipient and record Admin as operator');
assert(html.includes("if(!String(row.assignedUid||'').trim()||String(row.assignmentMode||'')==='open_pool')"), 'Admin must not complete unassigned/shared orders on behalf of an employee');

// Execute the real modal-opening function with a stub UI to validate its important state transitions.
const start = html.indexOf('function openAdminOutsideOrderPhotoCompletion(id){');
const end = html.indexOf('\nfunction openAdminCompleteOrder(id){', start);
assert(start >= 0 && end > start, 'outside Admin photo modal function must be present');
const code = html.slice(start, end);
const row = { id: 'dn-1', orderNo: 'DN-001', orderType: 'ĐN', sourceSystem: 'outside_tiktok', outsideTikTok: true,
  assignedUid: 'employee-uid', employee: 'Lan', assignmentMode: 'assigned', status: 'pending', items: [{plantIndex:0,plantName:'Cẩm tú mai',size:'C9',qty:2}] };
const elements = new Map();
function el(id) {
  if (!elements.has(id)) { const classes = new Set(); elements.set(id, { innerHTML: '', textContent: '', classList: { add(...names){names.forEach(x=>classes.add(x));}, remove(...names){names.forEach(x=>classes.delete(x));}, contains(name){return classes.has(name);} }, disabled: false }); }
  return elements.get(id);
}
const state = { role: 'admin', user: { uid: 'admin-uid' } };
const sandbox = {
  window: { CloudSync: { state: () => state } },
  CloudSync: { state: () => state },
  D: { packingOrders: [] }, orderNotificationState: { rows: [] }, adminFullAssignmentRowsCache: [row],
  findCachedPackingOrder: () => row,
  isEmployeeOutsideOrder: r => r?.outsideTikTok === true || r?.orderType === 'ĐN',
  mergeOrderIntoRows(rows, patch) { const base = Array.isArray(rows) ? rows.slice() : []; const i = base.findIndex(x => String(x.id) === String(patch.id)); if (i >= 0) base[i] = {...base[i], ...patch}; else base.unshift({...patch}); return base; },
  orderItemsLabel: () => 'Cẩm tú mai C9 × 2', orderTotalQty: () => 2, orderTotalPay: () => 5000, money: x => String(x),
  esc: x => String(x), $: el, toast: () => {}, updateAdminOrderProofStatus: () => {},
  pendingAdminOrderType: 'TT', pendingAdminOrderProof: [], pendingAdminOrderProofBusy: false, pendingAdminOrderProofUploadPromise: null,
  pendingAdminShipmentOcr: {}, pendingAdminShipmentOcrBusy: true, pendingAdminBarcodeDelegate: {}, scannerAutoCompleteOrderId: 'old', selectedOrderId: ''
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { timeout: 1000 });
sandbox.openAdminOutsideOrderPhotoCompletion('dn-1');
assert.strictEqual(sandbox.selectedOrderId, 'dn-1');
assert.strictEqual(sandbox.pendingAdminOrderType, 'ĐN');
assert.strictEqual(sandbox.pendingAdminShipmentOcrBusy, false);
assert.strictEqual(sandbox.pendingAdminBarcodeDelegate, null);
assert.strictEqual(sandbox.scannerAutoCompleteOrderId, '');
assert.strictEqual(el('editModal').classList.contains('show'), true, 'photo modal should open')
assert(el('editBody').innerHTML.includes('Lan') && el('editBody').innerHTML.includes('submitAdminCompleteOrder'));
assert(el('editBody').innerHTML.includes('capture="environment"') && el('editBody').innerHTML.includes('Không cần OCR'));
assert.strictEqual(sandbox.D.packingOrders[0].id, 'dn-1');
console.log('ADMIN OUTSIDE ORDER PHOTO COMPLETION TEST PASS');
