const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const start = html.indexOf('function clearProcessedTikTokLabelQueue(){');
const end = html.indexOf('function renderTikTokLabelQueue(){', start);
assert(start >= 0 && end > start, 'Admin cleanup function must exist before PDF queue rendering');
const source = html.slice(start, end);
const queue = [{ trackingNo: 'OLD1' }, { trackingNo: 'OLD2' }];
const selected = new Set(['OLD1', 'OLD2']);
let localSaved = false;
let renderMappings = 0;
let renderQueue = 0;
let toastMessage = '';
let prompt = '';
const context = {
  tiktokBulkAssignBusy: false,
  tiktokLabelQueue: queue,
  tiktokSelectedTrackingNos: selected,
  confirm: message => { prompt = message; return true; },
  saveTikTokLocalState: () => { localSaved = true; return true; },
  renderTikTokProductMappings: () => { renderMappings++; },
  renderTikTokLabelQueue: () => { renderQueue++; },
  toast: message => { toastMessage = message; }
};
vm.createContext(context);
vm.runInContext(source, context);
context.clearProcessedTikTokLabelQueue();
assert.deepStrictEqual(Array.from(context.tiktokLabelQueue), [], 'Only the local PDF staging queue must be cleared');
assert.strictEqual(context.tiktokSelectedTrackingNos.size, 0, 'Bulk selections must be cleared too');
assert(localSaved, 'Empty PDF queue must be persisted locally');
assert.strictEqual(renderMappings, 1, 'PDF product mapping display should refresh');
assert.strictEqual(renderQueue, 1, 'PDF queue display should refresh');
assert(/KHÔNG xóa đơn thật trên Firebase/.test(prompt), 'Confirmation must clearly explain that Firestore orders are not deleted');
assert(/tiền công/.test(prompt) && /tồn kho/.test(prompt), 'Confirmation must protect payroll and inventory');
assert(/Đã dọn 2 nhãn PDF tạm/.test(toastMessage), 'User must receive completion feedback');
assert(/tiktokQueueOrdersCache=rows\.slice\(\)/.test(html), 'Admin completion must refresh the authoritative order cache');
assert(/reconcileTikTokLabelQueueWithLiveOrders\(tiktokLabelQueue,rows\);\s*pruneTikTokProcessedLabelsFromQueue\(rows\)/.test(html), 'Admin completion must reconcile labels immediately if they have an exact order link');
console.log('PDF QUEUE ADMIN CLEANUP PASS: local staging queue only; selections cleared; cloud orders, history, inventory and payroll untouched');
