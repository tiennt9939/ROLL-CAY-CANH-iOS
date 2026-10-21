const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Recognition must load from shared Cloud before trying to auto-map imported PDF labels.
const renderStart = html.indexOf('async function renderTikTokLabelImport(loadUsers=true)');
const renderEnd = html.indexOf('\nfunction renderTikTokLabelQueue()', renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, 'TikTok PDF render function must exist');
const render = html.slice(renderStart, renderEnd);
assert(render.indexOf('await loadTikTokRecognitionRulesFromCloud(false)') >= 0, 'Admin must load cloud rules before auto-mapping');
assert(render.indexOf('await loadTikTokRecognitionRulesFromCloud(false)') < render.indexOf('autoMapTikTokProductMappings()'), 'Cloud rules must load before auto-map');

// Cloud persistence lives in the existing config document, separate from the growing business snapshot.
assert(html.includes('async function loadTikTokRecognitionRules()'), 'Cloud load API missing');
assert(html.includes('async function saveTikTokRecognitionRules(rules)'), 'Cloud save API missing');
assert(html.includes("configRef().get()"), 'Recognition rules must read the dedicated existing Cloud config document');
assert(html.includes("mergeFields:['tiktokRecognitionRules','tiktokRecognitionRulesUpdatedAtMs','tiktokRecognitionRulesUpdatedByUid']"), 'Recognition rules must update only their own top-level fields');
assert(html.includes('JSON.stringify(safe).length>250000'), 'Recognition rule save must stay below a safe Firestore document-size budget');
assert(html.includes('const now=Date.now(),ref=configRef()'), 'Recognition rules must be isolated from the large shared business snapshot');
assert(html.includes('loadTikTokRecognitionRules,saveTikTokRecognitionRules'), 'CloudSync must expose rule load/save to Admin UI');
assert(html.includes('TIKTOK_RECOGNITION_MIGRATION_PREFIX'), 'Old device-local rules must be migrated once');
assert(html.includes('TIKTOK_RECOGNITION_DELETES_KEY'), 'Rule invalidations must survive offline/retry');
assert(html.includes('for(const signature of tiktokRecognitionRuleDeletes)delete tiktokRecognitionRules[signature]'), 'Stale deleted rules must not be restored from Cloud on merge');
assert(html.includes('tiktokRecognitionRulesCloudError'), 'UI must disclose when rules could not be loaded from Cloud');
assert(html.includes('các nhãn tương tự ở lần nhập sau và thiết bị khác có thể dùng chung'), 'UI must explain shared learned rules');

// Manual changes must invalidate an old learned target, and only save a new rule when a complete mapping validates.
const updateStart = html.indexOf('function updateTikTokProductMap(key,index,field,value)');
const updateEnd = html.indexOf('\nfunction setTikTokLabelAssignee', updateStart);
assert(updateStart >= 0 && updateEnd > updateStart, 'Manual mapping update function missing');
const update = html.slice(updateStart, updateEnd);
assert(update.indexOf('tiktokRecognitionRuleDeletes.add(signature)') < update.indexOf("if(field==='catalogKey')"), 'Old rule must be invalidated before changing a manually confirmed mapping');
assert(update.includes('saveTikTokRecognitionRuleForProduct(key)'), 'A complete manual mapping must teach a replacement rule');
assert(update.includes('persistTikTokRecognitionRulesToCloud()'), 'Mapping edits must persist to Cloud');

// Normalized signatures allow similar label variants, while explicit sizes remain part of the signature and guard.
const c7 = { productName: 'Nguyệt quế Thái siêu hoa thơm 2 chậu C7 cao 15–20cm - mô tả A', sku: '2 chậu C7', sellerSku: '', qty: 1 };
const c7Variant = { productName: 'NGUYỆT QUẾ THÁI siêu hoa thơm, 2 CHẬU C7 cao 15-20cm - mô tả B', sku: '2 chậu C7', sellerSku: '', qty: 1 };
const c9 = { ...c7, productName: 'Nguyệt quế Thái siêu hoa thơm 2 chậu C9 cao 20–30cm - mô tả A', sku: '2 chậu C9' };
assert.strictEqual(parser.recognitionSignature(c7), parser.recognitionSignature(c7Variant), 'Accent/case/punctuation/marketing variation should keep the same learned signature');
const c7HeightVariant = { ...c7, productName: 'Nguyệt quế Thái siêu hoa thơm 2 chậu C7 cao 15-20 cm - mô tả mới' };
assert.strictEqual(parser.recognitionSignature(c7), parser.recognitionSignature(c7HeightVariant), 'Height-range text must not split the same plant/pot-size recognition rule');
assert.notStrictEqual(parser.recognitionSignature(c7), parser.recognitionSignature(c9), 'Explicit C7 and C9 labels must have distinct learned signatures');
console.log('TIKTOK RECOGNITION CLOUD PERSISTENCE TEST PASS');
