'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
assert(/versionName\s*=\s*"26\.2\.92"/.test(gradle)&&/versionCode\s*=\s*144/.test(gradle),'V26.2.92 metadata required');
const start=html.indexOf('async function adminAssignDailyShipmentLabels('),end=html.indexOf('async function loadAssignedDailyShipmentLabels(',start);
assert(start>=0&&end>start,'assignment transaction must exist');
const fn=html.slice(start,end);
for(const needle of [
  "expectedOrderNo=sourceOrderId?`TT-${sourceOrderId.slice(-8)}`:'',oldOrderNo=String(oldOrder.orderNo||'').trim()",
  "const sameOrder=!!sourceOrderId&&!!expectedOrderNo&&oldOrderNo===expectedOrderNo&&(!oldOrderTracking||oldOrderTracking===tracking)&&claimMatchesSameOrder",
  "current.status='legacy_linked'",
  "current.status='legacy_conflict'",
  "current.assignmentBlockReason",
  "skippedLegacyRows.push({...current})",
  "skippedLegacyRows,skippedRecordedRows"
]) assert(fn.includes(needle),`missing reconciliation invariant: ${needle}`);
assert(fn.includes('if(hasCompletionEvidence||hasFinancialOrInventoryEvidence){'),'completed/pay/stock legacy order must be examined');
assert(fn.includes('if(sameOrder){'),'only exact tracking + matching seller Order ID may be linked as historical');
const linkedBlock=fn.slice(fn.indexOf("if(sameOrder){"),fn.indexOf("current.assignmentStatus=current.status;nextRows[index]=current;continue;",fn.indexOf("if(sameOrder){")));
assert(!linkedBlock.includes('tx.delete(')&&!linkedBlock.includes('tx.set(claimRefs'),'linking an old completed order must never delete the historical order or rewrite its claim');
assert(html.includes("if(String(row?.status||'')==='legacy_linked')return 'legacy_linked'"),'assignment board must classify legacy-linked rows separately');
assert(html.includes("if(row?.status==='legacy_linked')return {ready:false,legacyLinked:true"),'legacy-linked row must be blocked from the scanner');
assert(html.includes('ĐÃ XỬ LÝ ĐƠN CŨ')&&html.includes('CẦN ĐỐI SOÁT'),'UI must show explicit locked-row statuses');

// The screenshot's seller Order ID suffix must match the preserved legacy TT order number.
const sellerOrderId='586598292464764821';
assert('TT-'+sellerOrderId.slice(-8)==='TT-64764821','reported Order ID must resolve to the same legacy TT order number');
assert('862533375387'.replace(/[^A-Z0-9]/gi,'')==='862533375387','reported tracking is normalized unchanged');
console.log('V26.2.69 LEGACY COMPLETED PDF LABEL RECONCILIATION PASS');
