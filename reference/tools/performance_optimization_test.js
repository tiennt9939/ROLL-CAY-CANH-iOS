'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

// Live order snapshots must not download every historical completion photo.
assert(source.includes('async function fromCloudValueSkippingHistoryImages(value,key=\'\')'),
  'lazy Drive hydration helper is missing');
assert(source.includes("new Set(['completionImage','completionImages','proofImages'])"),
  'history evidence image fields are not protected from eager hydration');
assert(source.includes('window.DriveStorage.fromCloudValueSkippingHistoryImages(rawRows)'),
  'Firestore order listener must use lazy image hydration');
assert(!source.includes('window.DriveStorage.fromCloudValue(rawRows).then(rows=>'),
  'admin live listener still eagerly downloads images for every order');
assert(source.includes('scheduleLegacyOrderImageMigration(rows)'),
  'legacy Base64 migration must run through the throttled background queue');
assert(source.includes('function scheduleLegacyOrderImageMigration(rows)'),
  'bounded background migration queue is missing');
assert(source.includes('persistPackerOrderCache(safeRows,uid,{deferLegacyMigration:true})'),
  'employee live listener must not upload every legacy photo during cache writes');
assert(source.includes('function openDailyProofImage('),
  'daily proof images need an explicit lazy viewer');
assert(source.includes('let usersListCache=null,usersListCacheAt=0,usersListFetchPromise=null'),
  'Admin user list needs a time-bounded request cache');
assert(source.includes('Date.now()-usersListCacheAt<30000'),
  'Admin user list cache lifetime should avoid repeated Firestore reads during rendering');
assert(source.includes('function invalidateUserManagementUI()'),
  'explicit user-management changes must invalidate the UI cache');
assert(source.includes('const ORDER_LOCAL_CACHE_DAYS=30;'),
  'local order cache must have a bounded completed-history window');
assert(source.includes('function retainOperationalOrderRows(rows,now=Date.now())'),
  'operational cache pruning helper is missing');
assert(source.includes('localSnapshot.packingOrders=localSnapshot.packingOrders.filter(row=>!isCompletedOrderOlderThanCacheWindow(row))'),
  'old completed orders must be pruned from local cache snapshots only');
assert(source.includes("ordersRef().where('status','==','pending').onSnapshot"),
  'Admin live listener must be scoped to active orders');
assert(source.includes("ordersRef().where('completedAtMs','>=',recentCutoff).onSnapshot"),
  'Admin live listener must scope completed orders to a recent window');
assert(!source.includes("const unsub=ordersRef().onSnapshot(snap=>"),
  'Admin must not attach a whole-collection realtime listener');

// Verify cache retention boundaries without mutating the caller-owned array.
const cacheStart=source.indexOf('const ORDER_LOCAL_CACHE_DAYS=30;');
const cacheEnd=source.indexOf('function localSaveOnly(){',cacheStart);
assert(cacheStart>=0&&cacheEnd>cacheStart,'could not isolate order cache retention helpers');
const cacheCtx={Date,Number,String,Array};vm.createContext(cacheCtx);
vm.runInContext(source.slice(cacheStart,cacheEnd)+'\nthis.retain=retainOperationalOrderRows; this.old=isCompletedOrderOlderThanCacheWindow;',cacheCtx);
const now=Date.parse('2026-10-12T12:00:00Z');
const cacheInput=[
  {id:'pending-old',status:'pending',createdAtMs:now-365*86400000},
  {id:'completed-recent',status:'completed',completedAtMs:now-10*86400000},
  {id:'completed-old',status:'completed',completedAtMs:now-90*86400000},
  {id:'completed-unknown-date',status:'completed'}
];
assert.deepStrictEqual(Array.from(cacheCtx.retain(cacheInput,now)).map(x=>x.id),['pending-old','completed-recent','completed-unknown-date'],
  'cache should keep all pending, recent completed, and undated legacy orders, pruning only dated old completed rows');
assert.strictEqual(cacheInput.length,4,'cache pruning must not mutate the live array');

// Exercise the exact lazy hydration helper in isolation with a fake Drive downloader.
const helperStart = source.indexOf("async function fromCloudValueSkippingHistoryImages(value,key='')");
const helperEnd = source.indexOf('  async function connect()', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'could not isolate lazy hydration helper');
const helperSource = source.slice(helperStart, helperEnd).trim();
const ctx = {
  LAZY_HISTORY_IMAGE_KEYS: new Set(['completionImage','completionImages','proofImages']),
  fromCloudValue: async value => `hydrated:${value}`,
  Promise, Set, String, Object, Array
};
vm.createContext(ctx);
vm.runInContext(`${helperSource}\nthis.lazyHydrate=fromCloudValueSkippingHistoryImages;`, ctx);
(async () => {
  const input = {
    catalog: [{ image: 'drive://plant-photo' }],
    daily: [{ proofImages: { 'Nhan Vien': 'drive://daily-proof' } }],
    orders: [{ completionImage: 'drive://order-photo', completionImages: ['drive://photo-1','drive://photo-2'], name: 'order' }]
  };
  const result = await ctx.lazyHydrate(input);
  assert.strictEqual(result.catalog[0].image, 'hydrated:drive://plant-photo',
    'catalog plant pictures should retain existing hydration behavior');
  assert.strictEqual(result.daily[0].proofImages['Nhan Vien'], 'drive://daily-proof',
    'daily proof must remain a reference until explicitly opened');
  assert.strictEqual(result.orders[0].completionImage, 'drive://order-photo',
    'order photo must remain a reference until explicitly opened');
  assert.deepStrictEqual(Array.from(result.orders[0].completionImages), ['drive://photo-1','drive://photo-2'],
    'order photo array must remain references');

  // Exercise the render coalescer for packers: repeated listener bursts schedule only one redraw. Admin snapshots are tested separately to use focused renders.
  const renderStart = source.indexOf('let orderSnapshotRenderTimer=0,orderSnapshotRenderDeferred=false,assignmentBatchUiRefreshInProgress=false;');
  const renderEnd = source.indexOf('\nfunction renderAll(){', renderStart);
  assert(renderStart >= 0 && renderEnd > renderStart, 'could not isolate order snapshot render coalescer');
  const timers = [];
  let renders = 0;
  const renderCtx = { setTimeout: fn => { timers.push(fn); return timers.length; }, renderAll: () => { renders++; }, invalidateInventoryIndexes: () => {}, window: { CloudSync: { state: () => ({ role: 'packer' }) } }, console };
  vm.createContext(renderCtx);
  vm.runInContext(source.slice(renderStart, renderEnd), renderCtx);
  renderCtx.scheduleOrderSnapshotRender();
  renderCtx.scheduleOrderSnapshotRender();
  renderCtx.scheduleOrderSnapshotRender();
  assert.strictEqual(timers.length, 1, 'snapshot burst must schedule only one timer');
  timers[0]();
  assert.strictEqual(renders, 1, 'snapshot burst must produce one full redraw');

  // In lite shipment mode, Admin snapshots must not repaint the hidden legacy assignment/PDF panels.
  const adminTimers=[];let assignmentRenders=0,pdfQueueRenders=0,stockRenders=0,reportRenders=0;
  let activeTab='day';
  const adminCtx={setTimeout:fn=>{adminTimers.push(fn);return adminTimers.length},invalidateInventoryIndexes:()=>{},
    DAILY_SHIPMENT_LITE_MODE:true,activeMainTabId:()=>activeTab,
    renderAssignmentControls:()=>{assignmentRenders++},renderTikTokLabelQueue:()=>{pdfQueueRenders++},
    renderStock:()=>{stockRenders++},renderReport:()=>{reportRenders++},scheduleHomeStockKpiRefresh:()=>{},
    $:()=>({classList:{contains:()=>false}}),window:{CloudSync:{state:()=>({role:'admin'})}},console};
  vm.createContext(adminCtx);vm.runInContext(source.slice(renderStart,renderEnd),adminCtx);
  adminCtx.scheduleOrderSnapshotRender();adminTimers.shift()();
  assert.strictEqual(assignmentRenders,0,'lite mode must not rebuild hidden legacy assignment controls on Admin snapshots');
  assert.strictEqual(pdfQueueRenders,0,'lite mode must not rebuild hidden legacy PDF queue on Admin snapshots');
  activeTab='stock';adminCtx.scheduleOrderSnapshotRender();adminTimers.shift()();
  assert.strictEqual(stockRenders,1,'inventory-dependent active tab should refresh after an order snapshot');
  assert.strictEqual(assignmentRenders,0,'active stock refresh must still skip legacy assignment controls');
  console.log('PERFORMANCE OPTIMIZATION TEST PASS: lazy historical images, bounded legacy migration, active-view rendering, and nonblocking shipment UI');
})().catch(err => { console.error(err); process.exitCode = 1; });


// Daily shipment mode must repaint only the active view, never every hidden tab or the legacy PDF queue.
const renderAllStart = source.indexOf('function renderAll(){');
const renderAllEnd = source.indexOf('\nfunction syncPackSelection()', renderAllStart);
assert(renderAllStart >= 0 && renderAllEnd > renderAllStart, 'could not isolate active-view renderAll');
const activeRender = source.slice(renderAllStart, renderAllEnd);
assert(activeRender.includes("if(tab==='day'){renderDay();if(DAILY_SHIPMENT_LITE_MODE&&typeof renderDailyShipmentPanel==='function')renderDailyShipmentPanel();return}"), 'daily view should render only daily shipment + day panels');
assert(!activeRender.includes('renderStock();renderReport();initShipmentTracking();renderControls();renderQuote();'), 'renderAll must not redraw every screen at once');
assert(!activeRender.includes('renderTikTokLabelImport(false)'), 'renderAll must not trigger legacy PDF reconciliation on each edit');
assert(source.includes('dailyShipmentMarkRowRecorded(tracking,report,false)'), 'successful scan should update only its DOM row instead of a full list redraw');
assert(!source.includes("localSaveOnly();try{localStorage.removeItem('quanlycay_dirty')}catch(_){}\n    try{AndroidBridge.ackDailyShipmentPhoto(path)"), 'successful scan should not synchronously serialize the full app cache for every parcel');
assert(source.includes("localStorage.getItem('roll_cay_admin_history_cache_v1')==='1'"), 'legacy full-history query must be skipped after a successful cache hydration');
assert(source.includes('let completedOrderRecordsCache=null,completedOrderItemRecordsCache=null,inventoryAggregateCache=null'), 'completed order and stock indexes should be cached');
assert(source.includes('function buildInventoryAggregateCache()') && source.includes('function inventorySumBefore('), 'stock/report calculations should use per-plant date indexes');
assert(source.includes('invalidateInventoryIndexes();\n  const updated=String(Date.now())'), 'derived stock indexes must invalidate when data is saved');
assert(source.includes('function ensureAdminHistoryLoaded()') && source.includes('runAdminRetentionPass();'), 'full order history and retention work should no longer block sign-in/scanning');
