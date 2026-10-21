'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
const main=fs.readFileSync(path.join(root,'app/src/main/java/com/quanlycay/apk/MainActivity.java'),'utf8');
const scanner=fs.readFileSync(path.join(root,'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java'),'utf8');
assert(/versionName\s*=\s*"26\.2\.92"/.test(gradle)&&/versionCode\s*=\s*144/.test(gradle),'assignment-first version metadata must match');
// Import creates a daily PDF queue row, not a legacy packingOrder / open pool order.
assert(html.includes("assignmentRequired:false,assignmentStatus:'unassigned'"),'new PDF labels must enter unassigned daily queue');
assert(html.includes('function importParsedLabelsIntoDailyShipments(parsed)'),'daily PDF import queue must be the primary intake');
assert(html.includes('Chia việc theo nhóm cây')&&html.includes('renderDailyShipmentAssignmentBoard'),'Admin must have the new plant-group assignment board');
// Combined data-driven filters and both per-label/bulk assignment remain available.
for(const id of ['dailyAssignmentStatusFilter','dailyAssignmentEmployeeFilter','dailyAssignmentPlantFilter','dailyAssignmentSizeFilter','dailyAssignmentUnitFilter','dailyAssignmentSearch']) assert(html.includes(id),`combined assignment filter missing: ${id}`);
assert(html.includes('adminAssignSingleDailyShipmentLabel')&&html.includes('adminBulkAssignDailyShipmentLabels'),'single-label and bulk assignment handlers must exist');
assert(html.includes('Phân bổ theo nhân viên:')&&html.includes('Lịch sử thay đổi'),'assignment summary and reassignment audit UI must exist');
assert(html.includes('assignmentHistory')&&html.includes('assignmentRevision'),'owner changes must retain history and increment revision');
assert(html.includes('legacyOrderIdsToDelete.push(oldOrderId)'),'assignment must safely retire an uncompleted linked legacy order');
assert(html.includes('hasFinancialOrInventoryEvidence'),'legacy orders with financial/inventory effects must be protected');
assert(html.includes('cleanupOrderHasCompletionEvidence(oldOrder)'),'completed legacy orders must be protected during assignment');
assert(html.includes("row.assignmentRequired===true")&&html.includes("String(row.assignedUid||'')===uid"),'only labels assigned to signed-in account are scanned');
assert(html.includes('Number(assignedRow.assignmentRevision||0)!==Number(orderPatch?.assignmentRevision||0)'),'scanner must fail if assignment changes after camera open');
// Legacy shared pool is blocked in the client, native bridge, and server rules.
assert(html.includes("if(isOpenPool)throw new Error('Cơ chế Đơn chung cũ đã ngừng."),'client must reject creation of open-pool orders');
assert(html.includes('const canReassignShared=false; // Legacy open-pool reassignment removed'),'legacy per-label shared-pool reassignment UI must be removed');
assert(html.includes("if(String(row.assignmentMode||'')==='open_pool'){toast('Mã này thuộc cơ chế Đơn chung cũ đã ngừng. Chưa ghi nhận."),'legacy open-pool scans must fail closed without attempting acceptance');
const bridgeStart=main.indexOf('public void scanDailyShipmentBatch(String expectedOrdersJson, String callbackId, String employeeNamesJson, String selectedEmployee)');
const bridgeEnd=main.indexOf('public String listDailyShipmentPendingPhotos()',bridgeStart);
assert(bridgeStart>=0&&bridgeEnd>bridgeStart&&!main.slice(bridgeStart,bridgeEnd).includes('startActivityForResult(intent, DAILY_SHIPMENT_BATCH_SCAN_REQ)'),'legacy camera bridge must fail closed');
const matchStart=rules.indexOf('match /packingOrders/{orderId}'),matchEnd=rules.indexOf('match /shipmentTrackingClaims/{trackingNo}',matchStart);
const orderRules=rules.slice(matchStart,matchEnd);
assert(matchStart>=0&&matchEnd>matchStart,'packingOrders rules must exist');
assert(orderRules.includes("request.resource.data.assignmentMode != 'open_pool'")&&!orderRules.includes("request.resource.data.acceptedBy == request.auth.uid"),'Firestore rules must stop open-pool create/claim');
assert(scanner.includes('dailyAssignmentMode')&&scanner.includes('EXTRA_DAILY_ASSIGNMENT_MODE'),'native camera must support assignment-only mode');
// Cleanup is Admin-only, previews actual Firebase scope, requires exact confirmation, and protects records.
assert(html.includes('previewLegacyIncompleteOrdersCleanup')&&html.includes('executeLegacyIncompleteOrdersCleanup'),'unfinished legacy order cleanup preview/execute must exist');
assert(html.includes('XOA DON CHUA HOAN TAT')&&html.includes('preview.fingerprint'),'cleanup must use typed confirmation and fingerprint validation');
assert(html.includes('cleanupOrderHasCompletionEvidence')&&html.includes('cleanupSafeOrderCandidate'),'cleanup must preserve completed/inconsistent records');
assert(html.includes('const orderTracks=safeCandidates.map')&&html.includes('!recordedTrack.has(tracking)&&!activeTrack.has(tracking)'), 'incomplete legacy orders with a recorded scan or active tracking claim must be protected');
assert(html.includes("if(scan&&(String(scan.status||'')==='recorded'||String(scan.report?.status||'')==='recorded'))throw new Error"), 'execute transaction must re-check scan evidence before deleting an old order');
assert(html.includes("String(scan.status||'')==='recorded'")&&html.includes("String(claim.status||'')!=='voided'"),'cleanup must preserve recorded scans and active claims');
assert(html.includes('dailyShipmentClearedTrackingNos')&&html.includes('applyDailyShipmentClearedMarkersToTikTokQueue'),'deleted labels must not reappear from stale local cache; fresh re-import is supported');
assert(html.includes('GIỮ NGUYÊN')&&html.includes('Tiền công, quyết toán, tồn kho, danh mục, giá, nhân viên: <b>KHÔNG SỬA</b>'),'cleanup UI must state preservation boundaries');
assert(!html.includes('tx.delete(claimRefs')&&!html.includes('tx.delete(scanRefs'),'cleanup must not delete claims/scans to make old orders disappear');
console.log('ASSIGNMENT-FIRST WORKFLOW TEST PASS: data-driven plant/size/unit/status filters, per-row/bulk assignment, owner lock, retired shared pool, safe unfinished-order cleanup');
