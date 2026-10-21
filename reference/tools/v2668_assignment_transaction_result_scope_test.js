'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/index.html'),'utf8');
const gradle=fs.readFileSync(path.join(root,'app/build.gradle.kts'),'utf8');
assert(/versionName\s*=\s*"26\.2\.92"/.test(gradle)&&/versionCode\s*=\s*144/.test(gradle),'V26.2.92 metadata missing');
const start=html.indexOf('async function adminAssignDailyShipmentLabels(');
const end=html.indexOf('async function loadAssignedDailyShipmentLabels(',start);
assert(start>=0&&end>start,'Admin PDF assignment function missing');
const fn=html.slice(start,end);
const transaction=fn.indexOf('await db.runTransaction(async tx=>');
assert(transaction>0,'Firestore transaction missing');
for(const name of ['legacyOrderIdsToDelete','voidedClaims']){
  const decl=fn.indexOf('const '+name+'=[];');
  assert(decl>=0&&decl<transaction, name+' must be declared outside/before the transaction callback');
  assert(fn.indexOf(name+'.length=0;',transaction)>transaction, name+' must reset on each transaction attempt');
  assert(!fn.slice(transaction).includes('const '+name+'=[];'), name+' must not be redeclared inside transaction callback');
}
assert(fn.includes('retiredLegacyOrderIds:legacyOrderIdsToDelete')&&fn.includes('voidedLegacyClaims:voidedClaims'),'result arrays must be returned after transaction');
assert(fn.includes('if(hasRecordedEvidence){')&&fn.includes('skippedRecordedRows.push'),'recorded evidence protection must remain');
console.log('V26.2.69 ASSIGNMENT TRANSACTION RESULT SCOPE PASS');
