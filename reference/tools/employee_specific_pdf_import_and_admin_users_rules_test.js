const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'tools/preflight.py'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');

assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'version must be 26.2.92 / code 140');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight metadata must match');
assert(workflow.includes('*AUTO-UPDATE-SOURCE.zip') && workflow.includes('V26.2.92'), 'auto-build trigger remains and workflow name updated');
assert(html.includes('onclick="startDailyShipmentPdfImport()"') && html.includes('NHẬP PDF NHÃN ĐƠN CHUNG'), 'common PDF import entry must remain');
assert(html.includes('onclick="startDailyShipmentPdfImportForEmployee()"') && html.includes('NHẬP PDF CHO NHÂN VIÊN'), 'separate employee import entry must exist');
assert(html.includes('function confirmDailyShipmentPdfImportForEmployee()') && html.includes('employeePdfImportTarget'), 'employee target selection modal must exist');
assert(html.includes('pendingDailyShipmentPdfImportTarget=null;') && html.includes('const employeeImportTarget=pendingDailyShipmentPdfImportTarget'), 'target intent must be scoped to one PDF callback');
assert(html.includes('requestedAssigneeUid') && html.includes('requestedAssigneeEmployeeId') && html.includes('assignPendingEmployeePdfRows'), 'targeted labels must remain pending until safe assignment');
assert(html.includes('delete current.requestedAssigneeUid') && html.includes('delete current.requestedAssigneeName'), 'pending target removed only after transaction assignment');
assert(html.includes('Tài khoản Firebase vừa tạo nhưng chưa có hồ sơ đã được hủy') && html.includes('Firebase Rules đang từ chối đọc hoặc ghi hồ sơ /users'), 'account-creation failure must diagnose Rules and clean up orphan Auth account');
assert(html.indexOf('const users=await listUsers();') < html.indexOf('createUserWithEmailAndPassword(email,password)'), 'must list/check users before creating Firebase Auth account');
assert(html.includes('THỬ TẢI LẠI DANH SÁCH USER') && html.includes('MỞ FIRESTORE RULES'), 'user-list fetch failure must give retry and Rules navigation');
assert(html.includes("const currentUid=String(s?.user?.uid||'').trim();") && html.includes('Đây là lỗi giao diện, không phải kết luận Firestore Rules từ chối.'), 'user-list rendering must guard missing/stale session uid and separate UI errors from Firestore errors');
assert(rules.includes('allow get, list: if isAdmin() || (signedIn() && request.auth.uid == uid);'), 'users list is restricted to Admin and own profile');
assert(!rules.includes('match /users/{uid} {\n      allow read: if signedIn();'), 'do not expose all user profiles to every signed-in user');
assert(rules.includes("myProfile().data.role.lower() == 'admin'"), 'Rules should normalize Admin role casing');

// Exercise the real helper with fake rows to ensure this workflow only tags safe, same-day unassigned labels.
const start = html.indexOf('function markDailyShipmentLabelsRequestedForEmployee(parsed,target){');
const end = html.indexOf('\nfunction dailyShipmentPendingPhotos()', start);
assert(start >= 0 && end > start, 'employee target marking function must exist');
const fn = html.slice(start, end);
const currentDate = '2026-10-20';
const rows = [
  { trackingNo: 'A123', date: currentDate, status: 'imported', assignedUid: '' },
  { trackingNo: 'B123', date: currentDate, status: 'imported', assignedUid: 'other-uid', assignedEmployeeName: 'Other' },
  { trackingNo: 'C123', date: '2026-10-19', status: 'imported', assignedUid: '' },
  { trackingNo: 'D123', date: currentDate, status: 'imported', assignedUid: '', requestedAssigneeUid: 'different-uid' },
  { trackingNo: 'E123', date: currentDate, status: 'legacy_conflict', assignedUid: '' },
];
let saves = 0, backups = 0;
const context = {
  D: { dailyShipmentOrders: rows },
  normalizeTracking: (x) => String(x || '').trim().toUpperCase(),
  dailyShipmentToday: () => currentDate,
  $: (id) => id === 'dDate' ? { value: currentDate } : null,
  dailyShipmentReportByTracking: (tracking) => tracking === 'F123' ? { status: 'recorded' } : null,
  save: () => { saves++; },
  dailyShipmentPersistLocalBackup: () => { backups++; },
  Date,
};
vm.runInNewContext(fn, context, { filename: 'markDailyShipmentLabelsRequestedForEmployee.js' });
const result = context.markDailyShipmentLabelsRequestedForEmployee([
  { trackingNo: 'A123' }, { trackingNo: 'B123' }, { trackingNo: 'C123' },
  { trackingNo: 'D123' }, { trackingNo: 'E123' }, { trackingNo: 'F123' },
], { uid: 'packer-1', employeeName: 'Luân lớn', employeeId: '0' });
assert.strictEqual(result.marked, 1, 'only one safe same-day unassigned label should be tagged');
assert.strictEqual(rows[0].requestedAssigneeUid, 'packer-1');
assert.strictEqual(rows[0].requestedAssigneeName, 'Luân lớn');
assert.strictEqual(rows[1].assignedUid, 'other-uid', 'existing assignment must not be overwritten');
assert.strictEqual(rows[2].requestedAssigneeUid, undefined, 'other-day label must not be reassigned');
assert.strictEqual(rows[3].requestedAssigneeUid, 'different-uid', 'pending target for another employee must be preserved');
assert.strictEqual(rows[4].requestedAssigneeUid, undefined, 'legacy-conflict label must stay blocked');
assert.strictEqual(saves, 1); assert.strictEqual(backups, 1);
console.log('EMPLOYEE PDF IMPORT + ADMIN USER/RULES FIX TEST PASS');
