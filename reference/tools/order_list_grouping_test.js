const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8'),gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(gradle.includes('versionName = "26.2.92"')&&gradle.includes('versionCode = 144'),'order grouping metadata must match the current app');
assert(html.includes("let packerOrderFilter='all',assignmentListFilter='all'"),'employee/Admin filters need separate state');
assert(html.includes('function orderTypeBreakdown(rows)'),'order type count helper missing');
assert(!html.includes("['common','🌐 Đơn chung']"),'old shared-order filter must be removed');
for(const t of ['ĐN','TT','ĐD'])assert(html.includes(`['${t}','${t}']`),`order type filter ${t} missing`);
const packStart=html.indexOf('function renderPackerOrders(){'),packEnd=html.indexOf('async function acceptOpenPoolOrder',packStart),pack=html.slice(packStart,packEnd);
assert(pack.includes('ĐƠN ĐƯỢC GIAO CHO BẠN · CHƯA HOÀN TẤT'),'employee list should be ordered by assigned state');
assert(!pack.includes('AI CŨNG CÓ THỂ NHẬN'),'shared pool UI must be retired');
assert(pack.includes('packerCompletedExpanded?\'open\':\'\'')&&pack.includes('details class="order-accordion"'),'completed orders should be collapsed and expandable');
const adminStart=html.indexOf('async function renderAssignmentControls(){'),adminEnd=html.indexOf('async function adminCompleteOrderNoPhoto(id){',adminStart),admin=html.slice(adminStart,adminEnd);
assert(admin.includes("(await getAdminAssignmentRows(s)).filter(r=>String(r.assignmentMode||'')!=='open_pool')"),'Admin table filters retired shared-pool rows');
assert(admin.includes("renderAdminEmployeeGroupSummaries(visiblePrivate,'private',assignmentListFilter)"),'pending assigned orders remain grouped by employee');
assert(admin.includes("renderAdminEmployeeGroupSummaries(completed,'completed',assignmentListFilter)"),'completed orders remain grouped by employee');
assert(admin.includes('assignmentCompletedExpanded?\'open\':\'\''),'Admin completed group is collapsed by default');
assert(html.includes('function setPackerOrderFilter(filter)')&&html.includes('function setAssignmentOrderFilter(filter)'),'filter handlers remain active');
console.log('ORDER LIST STATUS + EMPLOYEE GROUPING TEST PASS');
