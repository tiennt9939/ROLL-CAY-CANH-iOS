const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'tools/preflight.py'), 'utf8');
assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'must be V26.2.92 / code 141');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight must match V26.2.92');
const start = html.indexOf('function renderUserManagementRows(users,list,s){');
const end = html.indexOf('\nasync function renderUserManagement(force=false){', start);
assert(start >= 0 && end > start, 'user-list renderer must exist');
const source = html.slice(start, end);
const context = {
  ROLE_LABELS: { admin: 'Admin', packer: 'Nhân viên đóng hàng', viewer: 'Chỉ xem' },
  esc: (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  userManagementDisplayRevision: 4,
  userManagementNeedsRender: false,
  userManagementFreshUntil: 0,
  Date,
};
vm.runInNewContext(source, context, { filename: 'renderUserManagementRows.js' });
const list = { innerHTML: '', dataset: {} };
assert.doesNotThrow(() => context.renderUserManagementRows([{ uid: 'packer-1', email: 'worker@example.com', role: 'packer' }], list, {}), 'missing session must not throw a uid property error');
assert.strictEqual(list.dataset.userManagementRevision, '', 'missing session must invalidate rendered cache');
assert(list.innerHTML.includes('Phiên đăng nhập Admin chưa sẵn sàng'), 'missing session must show a recoverable UI state');
const validList = { innerHTML: '', dataset: {} };
assert.strictEqual(context.renderUserManagementRows([
  { uid: 'admin-1', email: 'admin@example.com', role: 'admin', active: true },
  null,
  { email: 'broken@example.com', role: 'packer' },
  { uid: 'packer-1', email: 'worker@example.com', role: 'packer', employeeName: 'Luân lớn', employeeId: '0', active: true },
], validList, { user: { uid: 'admin-1' } }), true, 'valid session should render list safely');
assert(validList.innerHTML.includes('admin@example.com') && validList.innerHTML.includes('worker@example.com'), 'valid rows should still render');
assert(!validList.innerHTML.includes('broken@example.com'), 'rows without uid should be skipped');
assert(validList.innerHTML.includes('disabled'), 'admin cannot disable/change their own account');
assert.strictEqual(validList.dataset.userManagementRevision, '4');
console.log('V26.2.92 ADMIN USER UID GUARD TEST PASS');
