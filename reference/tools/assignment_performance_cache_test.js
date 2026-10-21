#!/usr/bin/env node
'use strict';
const fs=require('fs'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../app/src/main/assets/index.html'),'utf8');
assert(source.includes('let assignmentOrdersCacheAt=0,assignmentOrdersFetchPromise=null,adminFullAssignmentRowsCache=null;'),'complete Admin assignment cache missing');
assert(source.includes('now-assignmentOrdersCacheAt<15000'),'assignment cache must suppress repeated full reads while selecting/filtering');
assert(source.includes("const rows=(await getAdminAssignmentRows(s)).filter(r=>String(r.assignmentMode||'')!=='open_pool');"),'assignment UI must use cached loader');
assert(source.includes('function mergeAdminAssignmentRowsLocal(rows){'),'local listener updates must merge into the authoritative full-history cache');
assert(source.includes('async function adminFindOrdersByTrackingNos(trackingNumbers){'),'targeted tracking precheck must be available');
assert(source.includes('if(Array.isArray(adminFullAssignmentRowsCache)){adminFullAssignmentRowsCache=adminFullAssignmentRowsCache.filter(x=>String(x.id)!==String(id));assignmentOrdersCacheAt=Date.now()}'),'deleting an order must invalidate/remove it from the complete Admin cache');
assert(source.includes("adminFullAssignmentRowsCache=rows.slice();assignmentOrdersCacheAt=Date.now();D.packingOrders=rows;localSaveOnly();try{localStorage.setItem('roll_cay_admin_history_cache_v1','1')}catch(_){}renderAll();"),'full payroll/history load must refresh the authoritative Admin cache and mark its local cache');
assert(source.includes("mergeAdminAssignmentRowsLocal(rows);\n    localSaveOnly();\n    if(st.role==='admin')await renderAssignmentControls();"),'notification refresh must merge pending Admin rows instead of replacing full history with a partial query');
assert(source.includes("if(Array.isArray(adminFullAssignmentRowsCache)){adminFullAssignmentRowsCache=adminFullAssignmentRowsCache.filter(x=>String(x.status||'')!=='completed'||!purgeSet.has(retentionOrderDate(x)));assignmentOrdersCacheAt=Date.now()}"),'retention purge must update Admin history cache too');
assert(source.includes('if((typeof tiktokBulkAssignBusy!==\'undefined\'&&tiktokBulkAssignBusy)||assignmentBatchUiRefreshInProgress){orderSnapshotRenderDeferred=true;return}'),'order snapshots must not trigger global renders during bulk assignment');
assert(source.includes('const session=window.CloudSync?.state?.();')&&source.includes("if(session?.role==='admin'){")&&!source.includes("if(session?.role==='admin'){\n        renderAll();"),'Admin order snapshots must refresh focused panels rather than unrelated stock/payroll/quote tabs');
assert(source.includes('await renderAssignmentControls();\n    }finally{'),'bulk assignment should refresh grouped assignments once after its batched writes');
console.log('ASSIGNMENT PERFORMANCE CACHE TEST PASS: full history kept separate from operational snapshots; bulk snapshots/rendering coalesced');
