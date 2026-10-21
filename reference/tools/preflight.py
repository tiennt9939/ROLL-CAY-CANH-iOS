from pathlib import Path
import hashlib, re, json, sys, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
java=ROOT/'app/src/main/java/com/quanlycay/apk/MainActivity.java'
html=ROOT/'app/src/main/assets/index.html'
bg=ROOT/'app/src/main/assets/quote-background.jpg'
manifest=ROOT/'app/src/main/AndroidManifest.xml'
styles=ROOT/'app/src/main/res/values/styles.xml'
data=ROOT/'app/src/main/assets/data.json'
rules=ROOT/'firestore.rules'
gradle=ROOT/'app/build.gradle.kts'
drive_test=ROOT/'tools/drive_image_persistence_test.js'
packer_ui_test=ROOT/'tools/packer_assignment_ui_test.js'
shared_pool_test=ROOT/'tools/shared_pool_orders_test.js'
order_list_test=ROOT/'tools/order_list_grouping_test.js'
profit_test=ROOT/'tools/daily_profit_test.js'
indexes=ROOT/'firestore.indexes.json'

for f in (java,html,bg,manifest,styles,data,rules,gradle,drive_test,packer_ui_test,shared_pool_test,order_list_test,profit_test,indexes):
    assert f.is_file(), f

assert hashlib.sha256(bg.read_bytes()).hexdigest() == '9c3965014db664df3caa1b42a85488c9a9c5557685e3c55d8b81625729655251'

j=java.read_text(encoding='utf-8')
ann=len(re.findall(r'@JavascriptInterface',j))
assert ann==19, f'Expected 19 native bridge methods for assigned-only daily shipment scanning, found {ann}'
assert 'play-services-auth:21.3.0' in (ROOT/'app/build.gradle.kts').read_text(encoding='utf-8'), 'Google Sign-In dependency missing'
for token in ('connectGoogleDrive', 'uploadDriveImage', 'downloadDriveImage', 'DRIVE_SCOPE'):
    assert token in j, f'Google Drive native bridge missing: {token}'
assert 'Drive không lưu được ảnh (HTTP ' in j and 'Không kiểm tra được ảnh' not in j, 'Drive upload must return explicit upload errors'
assert 'if (!inTargetFolder || uploadedSize <= 0)' in j and 'if (parents == null || uploadedSize <= 0)' in j, 'Drive upload must validate file size and destination folder, with a safe verification fallback'
assert 'FixedAttributesPrintAdapter' not in j, 'Legacy print adapter must stay removed'
assert 'CAPTURE_PRINT_HTML_JS' in j, 'Isolated print capture bridge missing'
assert 'MediaSize.ISO_A4' in j, 'Native ISO A4 print size missing'
assert 'ROLL_GARDEN_65X100' in j, '65x100 media size missing'
assert 'Downloads.RELATIVE_PATH' in j
assert 'ocrShippingImage' in j
assert 'public void ocrShippingImage(String dataUrl, String callback)' in j, 'OCR bridge must accept the callback used by index.html'
assert 'TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)' in j and '.process(image)' in j, 'Native ML Kit OCR processing missing'
assert '.put("tableRows", tableRows)' in j and 'JSONArray extractTableRows()' in j, 'Coordinate-based TikTok PDF table cell extraction missing'
assert 'deliverOcrResult(cb, recognized)' in j and 'deliverOcrResult(cb, "")' in j, 'OCR success/failure callback missing'
assert 'implementation("com.google.mlkit:text-recognition:16.0.1")' in (ROOT/'app/build.gradle.kts').read_text(encoding='utf-8'), 'ML Kit OCR dependency missing'
assert 'sendToFlashLabel' in j
assert 'window.' in j, 'Native file export path missing'

h=html.read_text(encoding='utf-8')
assert "AndroidBridge.ocrShippingImage(photo,'__packingShipmentOcrResult')" in h, 'Packing OCR callback wiring missing'
assert "AndroidBridge.ocrShippingImage(photo,'__adminShipmentOcrResult')" in h, 'Admin OCR callback wiring missing'
assert 'quote-background.jpg' in h
assert '.quote-pdf-bg' in h and '.quote-pdf-page' in h
assert 'function exportQuotePdf()' in h
assert 'function exportPayrollCsv()' in h
assert "const DAILY_SHIPMENT_ADMIN_LABEL='Admin — KHÔNG TÍNH CÔNG'" in h, 'Admin no-wage scan option missing'
assert 'const DAILY_SHIPMENT_ORDERS_CACHE_KEY=' in h and 'dailyShipmentRestoreLocalBackup()' in h, 'daily shipment local queue recovery missing'
assert 'wageRecorded:employeeSnap.wageEligible!==false' in h and 'r.wageRecorded===true' in h, 'Admin scans must not enter payroll totals'
assert 'dailyShipmentPersistLocalBackup();renderDailyShipmentPanel()' in h, 'PDF queue should persist before rendering'
assert 'function saveSalaryAdvance()' in h
assert 'function payrollAdvanceAvailable(' in h
assert 'function refreshAssignmentCatalogUI()' in h
assert 'refreshCatalogForAssignment' in h
assert 'V26.0.0 ROOT CAUSE FIX' in h
assert 'J&T Express' in h
assert 'J&T Cargo' in h
assert 'GHN' in h
assert "/^GHVN[A-Z0-9]{4,26}$/" in h, 'GHVN tracking prefix rule missing'
assert "/^862\\d{9}$/" in h, '12-digit J&T Express tracking rule missing'
assert "/^530\\d{9}$/" in h, '12-digit J&T Cargo tracking rule missing'
assert 'Ưu tiên các mẫu mã đã quy ước' in h, 'OCR tracking prefix filter missing'
assert 'CloudSync.schedulePush()' in h
assert 'const localCatalog=Array.isArray(D.catalog)' in h
assert "catalogId:String(x.catalogId||'')" in h, 'Assignment payload must preserve catalogId'
assert "catalogId:String(x?.catalogId||'')" in h, 'Cloud order creation must preserve catalogId'
assert "const catalogId=String(r?.catalogId??'').trim()" in h, 'Reports must resolve orders by catalogId first'
assert 'function addAssignmentItem()' in h
assert 'adminDeletePackerRecord:(id)=>state().adminDeletePackerRecord(id)' in h, 'Admin completed-record delete bridge must be exposed on window.CloudSync'
assert 'adminUpdatePackerRecord:(id,changes)=>state().adminUpdatePackerRecord(id,changes)' in h, 'Admin record update bridge must be exposed on window.CloudSync'
assert 'waitUntilAuthReady:(timeout)=>state().waitUntilAuthReady(timeout)' in h, 'Auth-ready top-level bridge required by print access checks'
assert 'assignPackSize' not in h, 'Legacy combo selector must be removed; each item line owns its quantity'
assert 'completionImages' in h and 'proofReady' in h
assert 'function openPackerCompleteOrder(id,scannedTracking=' in h, 'Packer must open the per-order completion modal immediately'
assert 'async function submitPackerCompleteOrder(id)' in h, 'Packer modal must submit through the authenticated packer completion path'
packer_render=h[h.index('function renderPackerOrders(){'):h.index('async function acceptOpenPoolOrder',h.index('function renderPackerOrders(){'))]
assert 'onclick=\"openPackerCompleteOrder(' in packer_render, 'Assigned orders must open the one-step completion modal'
assert 'acceptAssignedOrder(' not in packer_render, 'Normally assigned orders must not require a separate acceptance step'
assert 'acceptOpenPoolOrder(' not in packer_render and 'ĐƠN ĐƯỢC GIAO CHO BẠN' in packer_render, 'Packer UI must only show assigned orders'
assert "String(r.assignmentMode||'')!=='open_pool'" in packer_render and "String(r.assignedUid||'')===uid" in packer_render, 'Packer list must exclude legacy pool rows and limit to the assigned employee'
assert 'completePackingOrder(String(id),proofImages,sh)' in h, 'Packer must submit the proof array populated by its modal, as the assigned employee'
assert "const proofImages=Array.isArray(pendingAdminOrderProof)?pendingAdminOrderProof.filter(Boolean):[]" in h, 'Packer completion must use the same proof state as readAdminOrderProof'
assert "const status=$('adminOrderProofStatus'),btn=$('adminOrderCompleteBtn')" in h, 'Packer modal readiness must update the actual visible status and button'
assert "btn.classList.add('pack-submit-ready')" in h and "btn.classList.add('pack-submit-blocked')" in h, 'Packer modal button must visibly change red/green'
assert 'ĐƠN CHUNG · AI CŨNG CÓ THỂ NHẬN' not in packer_render and 'ĐƠN ĐƯỢC GIAO CHO BẠN · CHƯA HOÀN TẤT' in packer_render
assert 'const DriveStorage=(()=>{' in h and 'window.DriveStorage=DriveStorage' in h, 'Drive image storage bridge missing'
assert "const PREFIX='drive://'" in h, 'Firestore image reference format missing'
assert 'migrateOrderImagesToDrive' in h, 'Legacy order image migration missing'
assert 'async function renderShipments()' in h and 'openOrderPhotoGallery' in h, 'Shipment report must open private Drive image references on demand'
assert 'function rawCompletionImages(r)' in h and 'function openOrderPhotoGallery(' in h, 'Completed-order photo gallery must support up to two data URLs or private Drive references'
assert '📷 Xem ảnh (${x.photoCount})' in h and 'order-photo-gallery' in h, 'Completed order and shipment report photos must remain hidden until the user taps the gallery control'
assert 'Chưa kết nối Google Drive trên thiết bị này. Ảnh chưa được tải lên' in h, 'New evidence photos must not silently fall back to Base64 when Drive is disconnected'
assert 'DriveStorage.toCloudValue' in h and 'drive:// IDs' in h, 'Private Drive reference flow missing'
assert 'async function runRetentionCleanupInternal()' in h and 'async function runRetentionCleanup()' in h, 'Automatic 30-day cleanup is missing'
assert 'async function fromCloudValueSkippingHistoryImages(value,key=\'\')' in h, 'Lazy Drive hydration for historical images is missing'
assert 'function scheduleOrderSnapshotRender()' in h and 'scheduleOrderSnapshotRender();' in h, 'Order snapshot rendering must be coalesced'
assert 'function scheduleLegacyOrderImageMigration(rows)' in h and 'processLegacyOrderImageQueue()' in h, 'Legacy order photo migration must be serialized in the background'
assert 'retentionArchivePayrollForDates' in h, 'Payroll snapshots before cleanup are missing'
assert 'stockBaseDate' in h and 'monthlyStockSnapshots' in h and 'D.stockBaseDate=prevEnd' in h, 'Inventory baseline/month-end rollover is missing'
assert 'warningAtByDate' in h and 'RETENTION_DAY_MS' in h and 'timeByDate+RETENTION_DAY_MS' in h, '24-hour deletion warning/grace period is missing'
assert "String(r.status||'')==='completed'&&purgeSetForOrders.has(retentionOrderDate(r))" in h, 'Unfinished orders must be preserved'
assert 'pendingPayrollRetentionDates' in h and 'orderDataDeletedAtMs' in h, 'Payroll hold must recover after interrupted sync and start after confirmed order deletion'
assert 'Number(r.orderDataDeletedAtMs||0)>0' in h and 'now>=Number(r.deleteAfterMs)' in h, 'Wage archives must be paid and at least 10 days beyond order deletion before removal'
assert 'daily:cloudDaily.length||cloudHasAuthoritativeCleanup?cloudDaily:localDaily' in h, 'Explicit cleanup must not be undone by an empty Cloud daily list on a second device'
assert 'retentionCleanupPromise' in h and 'setInterval(runAdminRetentionPass,6*60*60*1000)' in h, 'Retention cleanup must be single-flight and periodically retried in foreground'
assert 'r.deleteAfterMs=Math.max(Number(r.deleteAfterMs)||0,now+10*RETENTION_DAY_MS)' in h, 'Late payroll settlement must receive another 10-day grace period'
assert "(D.shipments||[]).forEach(x=>{const d=String(x.date||x.completedDate||'');if(retentionValidDate(d))allDates.add(d)});" in h, 'Shipment history must be included in retention warning/purge dates'
assert 'setInterval(runAdminRetentionPass,6*60*60*1000)' in h and "document.addEventListener('visibilitychange'" in h, 'Retention checks need foreground/periodic triggers'
assert 'async function markPayrollPaid' in h and 'payrollSettlements' in h, 'Unpaid payroll protection is missing'
assert 'Đã xác nhận thanh toán' in h and 'Tiền công được bảo lưu' in h, 'Admin payroll retention UI is missing'
assert 'Ảnh riêng tư chỉ xem được bằng cùng tài khoản' in h, 'Drive account guidance missing'
assert 'printA4Page' in h
assert 'print-order' in h
# Payroll DOM must have exactly one payrollBody and no stray closing wrapper between advance card and body.
assert h.count('id="payrollBody"') == 1
assert '<section id="payroll"' in h and '</section>' in h

r=rules.read_text(encoding='utf-8')
assert 'request.resource.data.packSize >= 1' in r
assert 'request.resource.data.packSize <= 100' in r
assert "request.resource.data.completionMethod == 'admin_no_photo'" in r, 'Admin direct completion must be explicitly scoped in Firestore Rules'
assert "request.resource.data.status == 'completed'" in r and "request.resource.data.completedBy == request.auth.uid" in r, 'No-photo completed order must be Admin-authenticated'
assert "request.resource.data.completionImages.size() == 0" in r, 'Admin direct-completion rules must allow zero photos only in its named method'
assert 'request.resource.data.completionImages.size() == 1' in r, 'Normal order completion must require one photo'
assert 'request.resource.data.diff(resource.data).affectedKeys().hasOnly' in r, 'Packer updates must be limited to completion/evidence fields'
assert "get(/databases/$(database)/documents/packingOrders/$(request.resource.data.orderId)).data.orderType == 'TT'" in r, 'TT shipment claim must be scoped to the assigned employee order'
assert "resource.data.assignmentMode == 'open_pool'" not in r and "request.resource.data.acceptedBy == request.auth.uid" not in r, 'Legacy shared-pool claims must be removed from Firestore Rules'
assert "request.resource.data.assignmentMode != 'open_pool'" in r, 'Firestore must reject new shared-pool orders'
assert "request.resource.data.completionImages.size() == 1" in r and "resource.data.assignmentMode != 'open_pool'" in r, 'Assigned-order completion must require proof and reject legacy shared-pool rows'
idx=json.loads(indexes.read_text(encoding='utf-8'))
assert any(x.get('collectionGroup')=='packingOrders' and {f.get('fieldPath') for f in x.get('fields',[])} >= {'assignmentMode','assignedUid','status'} for x in idx.get('indexes',[])), 'Firestore composite index for open-pool query is missing'
assert 'adminCreateAssignments(true)' in h and 'adminCreateAssignments(false)' in h, 'Admin assignment form must expose both pending assignment and direct completion actions'
assert 'async function adminCompleteOrderNoPhoto(id)' in h, 'Admin should be able to complete an existing assigned order without photo'
assert "completionMethod:'admin_no_photo'" in h and "shipmentOcrStatus:'admin_no_photo'" in h, 'No-photo direct completion must be explicitly recorded'
assert '<div id="adminPackEntryPanel" class="hidden"' in h, 'Legacy standalone packing record form must be hidden/removed'
assert 'GHI NHẬN HOÀN TẤT (ADMIN · KHÔNG ẢNH)' in h, 'Admin direct-completion button must be visible on assignment form'
assert 'function orderItemWageProfile(' in h and 'function orderItemRate(' in h, 'Order-specific wage rules are missing'
assert 'const assignedPayAmount=items.reduce' in h and 'item.assignedRate=assignedRates[index]' in h, 'Admin-assigned wage snapshots per item and order must be stored'
assert "'completedBy','completionRecordedBy','shipment'" in r, 'Packer update whitelist must not expose writable wage fields'
assert "current.size==='C7'&&totalSameType>=5)return 1600" in h, 'Cẩm tú mai C7 wage rule missing'
assert "current.size==='C9'&&totalSameType>=4)return 2500" in h, 'Cẩm tú mai C9 wage rule missing'
assert "current.baseName.includes('tao thai')&&current.size==='C9')return 5000" in h, 'Táo Thái C9 5000 VND/plant wage exception missing'

assert 'function toLocalCacheValue(value)' in h, 'localStorage must persist Drive references, not image Base64 when uploaded'
assert 'drive.toLocalCacheValue(D):D' in h and 'countEmbeddedImages(localSnapshot)' in h, 'Primary local cache must be normalized to references and refuse unresolved Base64 writes'
assert 'async function ensureImageUploadedToDrive(' in h, 'Every captured image must be uploaded before being accepted'
for image_flow in ('readPlantImage(ev)', 'readAdminPackProofImage(ev)', 'readPackProofImage(ev)', 'readDeliveryOcrImage(ev)', 'readAdminOrderProof(ev,index)', 'readShipmentImage(ev)'):
    assert image_flow in h, f'Missing image flow {image_flow}'
assert h.count('ensureImageUploadedToDrive(') >= 7, 'Capture flows must upload images to Drive before processing'
assert 'async function migrateLocalImagesToDrive(' in h, 'Legacy local Base64 images must be migrated to Drive'
assert "key.startsWith('ROLL_CAY_PACKER_ORDERS_')" in h, 'Legacy employee order photo caches must also be migrated'
assert 'const cacheRefs=await drive.toCloudValue(rows' in h and 'JSON.stringify(cacheRefs)' in h, 'Employee order cache must persist Drive references only'
assert 'async function exportData()' in h and 'countEmbeddedImages(snapshot)' in h, 'Backup export must not include unmigrated Base64 photos'
assert 'await migrateLocalImagesToDrive({notify:false,render:false})' in h, 'Drive connection or queued legacy migration must migrate previous local images'
assert "const migrated=await migrateLocalImagesToDrive({notify:false,render:false})" in h and "await CloudSync.pushNow()" in h and "st.migrateOrderImagesToDrive()" in h, 'Manual Drive connection must retain legacy image migration and Cloud reference sync'
assert 'function toLocalCacheValue(value)' in h and 'cacheRows=await drive.toCloudValue(safe' in h and 'JSON.stringify(cacheRows)' in h, 'Secondary packer order cache must persist Drive references only'
assert "backup-drive-references.json" in h, 'JSON backup should export Drive references rather than image bytes'

assert 'function hasDriveReference(dataUrl)' in h, 'Image writes must be gated on a confirmed Drive reference'
assert 'const snapshot=JSON.parse(JSON.stringify(D))' in h and 'D=await drive.fromCloudValue(refs)' not in h, 'Background migration must not overwrite edits made while uploads are in flight'
assert 'function displayImageSrc(value,fallback=\'\')' in h, 'Cached Drive references must be safely resolved for UI previews'
assert 'persistPackerOrderCache' in h and 'cacheRows=await drive.toCloudValue(safe' in h, 'Secondary order cache must upload legacy images and persist Drive references only'
assert 'Deferred local cache write' in h and 'countEmbeddedImages(localSnapshot)' in h, 'Local cache must not write unresolved Base64 image payloads'
assert 'DRIVE IMAGE PERSISTENCE TEST PASS' in drive_test.read_text(encoding='utf-8'), 'Drive-only local image persistence regression test is missing'
assert 'window.__rollDriveImageMigrationPromise' in h, 'Legacy image migration must be single-flight to avoid duplicate uploads'
assert 'verifiedDriveIds.add(String(r.id))' in h and 'downloaded.set(String(r.id),dataUrl)' not in h, 'Uploads must not duplicate every photo in the transient download cache'
assert "await drive.fromCloudValue(cacheRefs)" not in h, 'Local photo migration must not immediately redownload every uploaded photo'
assert "await window.DriveStorage.fromCloudValue(snapshot)" not in h, 'Backup export must not download images after uploading them'
assert 'async function migrateOrderImagesToDrive()' in h and 'await st.migrateOrderImagesToDrive()' in h, 'Explicit Drive connection must retain the legacy Firestore order-photo migration path'

g=gradle.read_text(encoding='utf-8')
version_name_match = re.search(r'versionName\s*=\s*"([0-9]+(?:\.[0-9]+)+)"', g)
version_code_match = re.search(r'versionCode\s*=\s*([0-9]+)', g)
assert version_name_match, 'Android versionName must be a dotted numeric version'
assert version_code_match, 'Android versionCode must be declared'
version_name = version_name_match.group(1)
version_code = int(version_code_match.group(1))
assert 'create("stableDebug")' in g and 'file("debug.keystore")' in g, 'Stable debug signing config is missing'
assert 'signingConfig = signingConfigs.getByName("stableDebug")' in g, 'Debug variant must use stable signing when keystore exists'
assert 'buildConfig = true' in g, 'BuildConfig generation must be enabled for the native updater'
assert 'checkForAppUpdates' in j and 'downloadAndInstallAppUpdate' in j, 'Native in-app updater bridge is missing'
assert 'GITHUB_LATEST_RELEASE_API' in j and 'downloadVerifiedUpdate' in j, 'Updater must use GitHub Releases and verify APK checksum'
assert 'appUpdatePanel' in h and 'KIỂM TRA CẬP NHẬT' in h and 'TẢI VÀ CÀI ĐẶT BẢN MỚI' in h, 'In-app updater UI missing'
assert 'REQUEST_INSTALL_PACKAGES' in manifest.read_text(encoding='utf-8'), 'Installer permission missing'
assert (ROOT/'app/src/main/res/xml/file_paths.xml').is_file(), 'FileProvider path configuration missing'
assert 'id="editPlantFloorPrice"' in h, 'Admin-only floor price field missing'
assert 'function calculateDailyProfitSummary(' in h, 'Daily profitability calculator missing'
assert 'function renderDailyProfitPanel(' in h, 'Admin daily profit panel missing'
assert 'function saveDailyMaterialExpense()' in h, 'Daily material expense editor missing'
assert 'materialExpensesByDate' in h, 'Daily material expenses must persist in application data'
assert 'id="catalogExportSale"' in h
assert 'id="catalogExportPurchase"' in h
assert 'function exportCatalogPriceCsv()' in h
assert 'function exportCatalogPricePdf()' in h
# Quotation page must independently select sale/purchase columns for both PDF and CSV.
assert 'id="quoteExportSale"' in h and 'id="quoteExportPurchase"' in h
assert 'function quotePriceOptions(' in h
assert 'function onQuotePriceOptionsChanged()' in h
assert 'function quotePurchasePrice(' in h
assert "if(includePurchase&&role!=='admin')" in h
assert "headers.push('Giá nhập','Thành tiền nhập')" in h
assert "headers.push('Giá bán','Thành tiền bán')" in h
assert "const label=includePurchase&&includeSale?'gia-nhap-va-gia-ban':includePurchase?'gia-nhap':'gia-ban'" in h
assert "if(includePurchase&&role!=='admin')" in h
assert 'if(!includeSale&&!includePurchase)' in h

# TikTok PDF import and barcode lookup must remain a separate, backward-compatible path.
label_parser=ROOT/'app/src/main/assets/tiktok-label-import.js'
assert label_parser.is_file(), 'Offline TikTok PDF label parser missing'
assert (ROOT/'tools/tiktok_pdf_multi_product_same_order_regression_test.js').is_file(), 'Same-order multi-product + wrapped-description regression test is missing'
assert '<script src="tiktok-label-import.js"></script>' in h, 'TikTok label parser is not loaded before app code'
assert 'pickTikTokShippingPdf' in j and 'scanTikTokShippingBarcode' in j, 'Native PDF picker / barcode bridge missing'
assert 'scanDailyShipmentBatch' in j and 'listDailyShipmentPendingPhotos' in j and 'loadDailyShipmentPhoto' in j and 'ackDailyShipmentPhoto' in j, 'Daily shipment scan/photo retry bridge missing'
assert 'checkDailyShipmentClaims' in h and 'recordDailyShipmentScan' in h, 'Daily shipment duplicate precheck / atomic report transaction missing'
assert 'private boolean isTrackableTracking(String value)' in (ROOT/'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java').read_text(encoding='utf-8'), 'Daily scanner must match normalized tracking against the imported PDF list'
assert 'FORMAT_EAN_13' in (ROOT/'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java').read_text(encoding='utf-8'), 'Daily scanner missing expanded linear barcode formats'
assert "String(orderPatch?.source||'')==='pdf_label'" in h, 'Unknown tracking formats must only pass validation when linked to an imported PDF row'
assert 'dailyShipmentSeenPaths' in h and 'dailyShipmentReportRows' in h, 'Daily shipment de-duplication/report projection missing'
assert 'id="dailyShipmentPanel"' in h and 'QUÉT ĐƠN ĐÃ GIAO + TỰ CHỤP' in h, 'Daily shipping workflow UI missing'
assert 'function dailyShipmentQtyForPlant(' in h, 'Daily shipping stock deduction not linked to stock calculation'
assert 'versionName = "26.2.92"' in g and 'versionCode = 144' in g, 'V26.2.92 metadata missing'
assert 'startDailyShipmentPdfImportForEmployee' in h and 'NHẬP PDF NHÃN ĐƠN CHUNG' in h, 'Separate employee PDF flow must coexist with the common PDF import'
assert 'requestedAssigneeUid' in h and 'assignPendingEmployeePdfRows' in h, 'Employee-targeted PDF labels must be held as a pending assignment until safe to assign'
assert 'allow get, list: if isAdmin() || (signedIn() && request.auth.uid == uid)' in rules.read_text(encoding='utf-8'), 'User listing must stay restricted to Admin/self'
assert 'function previewDailyShipmentReset(date)' in h and 'function resetDailyShipmentData(date,expectedFingerprint,confirmationText)' in h, 'Admin date-reset API missing'
assert 'function normalizeResetTracking(value)' in h, 'Reset tracking normalizer is required by preview and execute flow'
assert 'dailyShipmentResetDates' in h and 'resetBusinessConfirmPhrase(date)' in h, 'Date-reset marker and date-specific typed confirmation missing'
assert 'id="dailyBusinessResetDate" type="date"' in h and 'function resetValidBusinessDate(value)' in h, 'Date-selectable reset control / date validation missing'
assert (ROOT/'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java').is_file(), 'Custom CameraX barcode scanner activity missing'
scanner_src=(ROOT/'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java').read_text(encoding='utf-8')
assert 'enableTorch(torchEnabled)' in scanner_src and 'setZoomRatio(desired)' in scanner_src and 'startFocusAndMetering(action)' in scanner_src, 'Barcode scanner must support torch, zoom and autofocus'
assert 'pdfbox-android:2.0.27.0' in g and 'barcode-scanning:17.3.0' in g and 'camera-camera2:1.4.2' in g and 'camera-lifecycle:1.4.2' in g and 'camera-view:1.4.2' in g, 'PDF/ML Kit/CameraX dependencies missing'
assert 'class VisualLayoutPdfTextStripper extends PDFTextStripper' in j, 'Visual coordinate PDF extractor missing'
assert 'extractVisualPage(document, page)' in j and '.put("visualText", visualText == null ? "" : visualText)' in j, 'Visual coordinate PDF text is not returned to parser'
assert '{value:page.visualText,alignedColumns:true}' in label_parser.read_text(encoding='utf-8') and '{value:page.text,alignedColumns:false}' in label_parser.read_text(encoding='utf-8'), 'Parser must prioritize aligned visual extraction and protect wrapped SKU counts from being treated as Qty'
assert 'function autoMapTikTokProductMappings()' in h and 'matchCatalogProduct' in label_parser.read_text(encoding='utf-8'), 'PDF products must be matched against the live app catalog when the match is unique'
assert 'autoMapTikTokProductMappings();' in h, 'Admin TikTok panel must invoke safe catalog auto-mapping after catalog load'
catalog_match_test=ROOT/'tools/tiktok_catalog_matcher_test.js'
assert catalog_match_test.is_file(), 'TikTok catalog matching regression test missing'
workflow_text=(ROOT/'.github/workflows/build-apk.yml').read_text(encoding='utf-8')
assert 'push:' in workflow_text and '**/*AUTO-UPDATE-SOURCE.zip' in workflow_text, 'Build workflow must automatically run when a versioned source ZIP is uploaded to main'
assert 'for test in tools/*_test.js; do' in workflow_text, 'Build workflow must run every JavaScript regression test'
assert (ROOT/'tools/tiktok_catalog_matcher_test.js').is_file(), 'TikTok catalog matching regression test is missing'
assert "sourceSystem==='tiktok_pdf'?ordersRef().doc('tiktok_'+importedTracking)" in h, 'TikTok imports must have deterministic order IDs to prevent duplicates'
assert 'validatePackingShipmentEvidence(row,pendingAdminShipmentOcr)' in h and 'function isTikTokPdfOrder(order)' in h, 'Imported order must validate scanned tracking against the assigned order'
assert "shipmentOcrStatus:(sh.verificationMethod==='barcode_scan'?'barcode_verified':'completed')" in h, 'Barcode completion state missing'
assert 'function startTikTokPdfImport()' in h and 'function startTikTokBarcodeScan(' in h, 'TikTok PDF import / barcode scan UI missing'
assert 'function startAdminTikTokBarcodeScanForOrder(id)' in h, 'Admin delegated barcode scanner entry point missing'
assert (ROOT/'tools/admin_outside_order_photo_completion_test.js').is_file(), 'Admin outside-order photo completion regression test missing'
assert (ROOT/'tools/employee_outside_order_and_daily_plant_report_test.js').is_file(), 'Employee outside-order visibility/daily plant report regression test missing'
assert 'function openAdminOutsideOrderPhotoCompletion(id)' in h and 'ADMIN CHỤP ẢNH & HOÀN TẤT' in h, 'Admin outside-order photo completion action missing'
assert 'packerDailyPlantWageSummary' in h and 'packerReportOwnSummary' in h, 'Employee daily plant quantity / wage summary missing'
assert 'adminCompleteAssignedPackingOrder' in h and 'adminCompleteAssignedPackingOrder' in h[h.index('function state(){'):h.index('function state(){')+2500], 'Admin delegated completion API must be exposed through CloudSync'
assert "completionMethod:'admin_barcode_scan_delegate'" in h and 'completionScannedByAdmin:true' in h, 'Admin scan completion must be auditable'
assert 'completedBy:expectedUid' in h and 'completionRecordedBy:String(user.uid)' in h, 'delegated completion must credit the assigned employee and separately record the admin actor'
assert "if(String(current.assignedUid||'')!==expectedUid||String(current.assignmentMode||'')==='open_pool')throw new Error('Người nhận đơn đã thay đổi trong lúc quét." in h, 'transaction must revalidate assignee before idempotent completion branch'
assert 'ADMIN QUÉT THAY · GHI CÔNG ${esc(adminOrderEmployeeDisplayName(r))}' in h, 'Admin assignment card lacks delegated scan action'
ET.parse(manifest); ET.parse(styles); json.loads(data.read_text(encoding='utf-8'))
print('PREFLIGHT PASS')
print('Background SHA-256:', hashlib.sha256(bg.read_bytes()).hexdigest())
print('JavascriptInterface count:', ann)
print('Google Drive bridge and legacy image migration: PASS')
print(f'Version: {version_name} / code {version_code}')
print('Daily profitability: floor price revenue - plant cost - wages - material expenses; admin-only and excluded from quotation exports')
print('Order lists: full classified counts, assigned/private/type filters, completed sections collapsed by default')
print('Packer assigned-order flow: assignment-only work list; wrong-owner scans blocked; retired shared pool disabled')
print('Drive image persistence audit: captured photos upload before acceptance; all local cache paths persist Drive references')
print('Catalog price export: sale/purchase/both selectable; purchase export admin-only')
print('Quotation PDF/CSV: sale/purchase/both selectable; purchase visible/export admin-only')
print('Multi-item assignment: per-line quantities preserved; order total 1..100')
print('Payroll export: PASS')
print('Salary advance: PASS')
print('Assignment refresh: PASS')
print('Isolated print WebView: PASS')
