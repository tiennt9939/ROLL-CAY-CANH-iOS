'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
assert(/versionName\s*=\s*"26\.2\.92"/.test(gradle) && /versionCode\s*=\s*144/.test(gradle), 'V26.2.92 metadata missing');
assert(workflow.includes('push:') && workflow.includes("'**/*AUTO-UPDATE-SOURCE.zip'"), 'source archive push must trigger GitHub Actions');
assert(html.includes('function tiktokRecognitionSignatureKeys('), 'UI must manage current and legacy recognition keys together');
assert(html.includes('api?.keyForProduct?.(p)||savedKey') && html.includes('tiktokProductMaps[stableKey]=tiktokProductMaps[savedKey].map'), 'existing local product mappings must migrate to legacy-stable keys without being discarded');
assert(html.includes('function migrateTikTokProductMapKeys(){'), 'legacy key migration must be reusable by the whole queue');
assert(html.includes('function isLegacyV2RecognitionSignature(') && html.includes('for(const signature of [...tiktokRecognitionRuleDeletes])if(isLegacyV2RecognitionSignature(signature))'), 'V26.2.72 rule tombstones must be cleared instead of deleting legacy fallback rules');
assert(html.includes('recoveredLocalLegacyRules>0'), 'load path must recover an available local V2 rule if Cloud no longer has its copy');
const updateMapStart = html.indexOf('function updateTikTokProductMap(');
const updateMapEnd = html.indexOf('\nfunction chooseTikTokProductCandidate(', updateMapStart);
const updateMapBlock = html.slice(updateMapStart, updateMapEnd);
assert(updateMapStart >= 0 && updateMapEnd > updateMapStart && !updateMapBlock.includes('tiktokRecognitionRuleDeletes.add(') && !updateMapBlock.includes('delete tiktokRecognitionRules['), 'ordinary Admin mapping edits must not delete learned recognition rules');
const autoMapStart = html.indexOf('function autoMapTikTokProductMappings(){');
const autoMapEnd = html.indexOf('\nfunction tiktokProductMappingLines', autoMapStart);
const autoMapBlock = html.slice(autoMapStart, autoMapEnd);
assert(autoMapStart >= 0 && autoMapEnd > autoMapStart && !autoMapBlock.includes('tiktokRecognitionRuleDeletes.add(') && !autoMapBlock.includes('delete tiktokRecognitionRules['), 'background auto-map must not tombstone or delete saved recognition rules');
const removeMapStart = html.indexOf('function removeTikTokProductMapLine(');
const removeMapEnd = html.indexOf('\nfunction saveTikTokRecognitionRuleForProduct(', removeMapStart);
const removeMapBlock = html.slice(removeMapStart, removeMapEnd);
assert(removeMapStart >= 0 && removeMapEnd > removeMapStart && !removeMapBlock.includes('tiktokRecognitionRuleDeletes.add(') && !removeMapBlock.includes('delete tiktokRecognitionRules[') && removeMapBlock.includes('manualNeedsReview:true'), 'removing a mapped line must preserve learned rules and leave a manual-review placeholder');
const manualConfirmStart = html.indexOf('async function confirmAndLearnTikTokProductRule(');
const manualConfirmEnd = html.indexOf('\nfunction setTikTokProductMapToExpected(', manualConfirmStart);
const manualConfirmBlock = html.slice(manualConfirmStart, manualConfirmEnd);
assert(manualConfirmStart >= 0 && manualConfirmEnd > manualConfirmStart && !manualConfirmBlock.includes('delete tiktokRecognitionRules[') && !manualConfirmBlock.includes('tiktokRecognitionRuleDeletes.add('), 'confirming a newer rule must retain legacy fallback rules');
assert(/function renderTikTokLabelQueue\(\)\{\s*const box=\$\('tiktokLabelQueue'\);if\(!box\)return;\s*migrateTikTokProductMapKeys\(\);/.test(html), 'queue render must migrate saved map keys before checking mapping status');
assert(/function tiktokUniqueProducts\(\)\{\s*migrateTikTokProductMapKeys\(\);/.test(html), 'recognition mapping panel must migrate legacy map keys too');
assert(/function renderDailyShipmentPanel\(\)\{\s*dailyShipmentRestoreLocalBackup\(\);\s*migrateTikTokProductMapKeys\(\);/.test(html), 'daily shipment and completed-label warnings must normalize product mapping keys before rendering');
// Exercise the real migration helper in isolation: old mapping keys must be copied, not deleted,
// and queue rows from every date must be normalized before the renderer evaluates them.
const vm = require('vm');
const startMigration = html.indexOf('function migrateTikTokProductMapKeys(){');
const endMigration = html.indexOf('\nfunction tiktokUniqueProducts()', startMigration);
assert(startMigration >= 0 && endMigration > startMigration, 'migration helper block must be extractable for behavior test');
const migrationCode = html.slice(startMigration, endMigration);
const oldQueueProduct = { productName: 'Lài trà siêu hoa thơm', mapKey: 'parser_v3_old', qty: 2 };
const completedDailyProduct = { productName: 'Cây Ruby Đỏ', mapKey: 'parser_v3_daily', qty: 1 };
const originalMapLines = [{ catalogKey: 'traliai-c9', perUnit: 2, autoMatched: false }];
const dailyMapLines = [{ catalogKey: 'rubi-c7', perUnit: 5, autoMatched: false }];
let saveCount = 0, dailyBackupCount = 0;
const sandbox = {
  window: { TikTokLabelImport: { keyForProduct: (p) => p.productName.includes('Ruby') ? 'ttp_12pc52j' : 'ttp_140719x' } },
  tiktokLabelQueue: [{ date: '2026-10-18', trackingNo: 'old-date', products: [oldQueueProduct] }],
  D: { dailyShipmentOrders: [{ trackingNo: 'completed-row', status: 'recorded', products: [completedDailyProduct] }] },
  tiktokProductMaps: { parser_v3_old: originalMapLines, parser_v3_daily: dailyMapLines },
  saveTikTokLocalState() { saveCount++; return true; },
  dailyShipmentPersistLocalBackup() { dailyBackupCount++; return true; }
};
vm.createContext(sandbox);
vm.runInContext(migrationCode + '\nthis.migrateResult = migrateTikTokProductMapKeys();', sandbox);
assert.strictEqual(oldQueueProduct.mapKey, 'ttp_140719x', 'legacy queue product mapKey should be normalized even on a non-selected date');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.tiktokProductMaps['ttp_140719x'])), originalMapLines, 'old mapping lines should be copied to the stable key');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.tiktokProductMaps.parser_v3_old)), originalMapLines, 'old mapping key should remain as recovery data');
assert.strictEqual(completedDailyProduct.mapKey, 'ttp_12pc52j', 'completed daily shipment rows without a queue entry must also normalize their old mapping key');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.tiktokProductMaps['ttp_12pc52j'])), dailyMapLines, 'completed-row mapping lines should migrate to the stable key');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.tiktokProductMaps.parser_v3_daily)), dailyMapLines, 'completed-row legacy mapping key should be retained as recovery data');
assert.strictEqual(sandbox.migrateResult, true, 'first migration should report a change');
assert.strictEqual(saveCount, 1, 'first migration should persist queue/map state exactly once');
assert.strictEqual(dailyBackupCount, 1, 'daily shipment display compatibility should be locally backed up');
vm.runInContext('this.migrateAgain = migrateTikTokProductMapKeys();', sandbox);
assert.strictEqual(sandbox.migrateAgain, false, 'migration should be idempotent');
assert.strictEqual(saveCount, 1, 'second migration should not repeatedly persist unchanged data');
assert.strictEqual(dailyBackupCount, 1, 'second migration should not repeatedly write daily backup');

const catalog = [
  { _key: 'traliai-c9', i: 0, p: { name: 'Trà lài', size: 'C9' } },
  { _key: 'quynhanh-c7', i: 1, p: { name: 'Quỳnh Anh', size: 'C7' } },
  { _key: 'ngocngan-c7', i: 2, p: { name: 'Ngọc Ngân', size: 'C7' } },
  { _key: 'phuquy-c7', i: 3, p: { name: 'Phú quý', size: 'C7' } },
  { _key: 'rubi-c7', i: 4, p: { name: 'Cây Rubi Đỏ', size: 'C7' } },
];

const laiTra = {
  productName: 'Lài trà siêu hoa thơm',
  rawProductName: 'Lài trà siêu hoa thơm nở quanh năm',
  sku: '2 chậu 20-30cm', sellerSku: '', qty: 2
};
const oldLaiSignature = '{"v":2,"identityTokens":["hoa","lai","sieu","thom","tra"],"sizes":[],"perUnit":2}';
assert.strictEqual(parser.keyForProduct(laiTra), 'ttp_140719x', 'Lài trà mapping key must remain identical to V26.2.72');
assert(parser.legacyRecognitionSignatures(laiTra).includes(oldLaiSignature), 'legacy V26.2.72 Lài trà signature must remain available');
let result = parser.applyRecognitionRule(laiTra, catalog, {
  [oldLaiSignature]: { lines: [{ catalogKey: 'traliai-c9', perUnit: 2 }], savedAtMs: 1 }
});
assert(result.matched && result.learnedRule && result.perUnit === 2, 'old Lài trà rule must be found through legacy key');
assert.strictEqual(result.perUnit * laiTra.qty, 4, 'Lài trà Qty 2 must produce 4 plants total');

const quynhAnh = {
  productName: 'Combo của tháng 4 chậu quỳnh anh sẵn nụ hoa',
  rawProductName: 'Combo của tháng| 4 chậu quỳnh anh sẵn nụ hoa nở quanh năm trang trí sân vườn',
  sku: 'Mặc định', sellerSku: '', qty: 2
};
assert.strictEqual(parser.keyForProduct(quynhAnh), 'ttp_18kjtfb', 'Quỳnh Anh mapping key must remain identical to V26.2.72');
const oldQuynhSignature = '{"v":2,"identityTokens":["anh","combo","cua","hoa","nam","nu","quanh","quynh","san","thang","trang","tri"],"sizes":[],"perUnit":4}';
assert(parser.legacyRecognitionSignatures(quynhAnh).includes(oldQuynhSignature), 'wrapped Quỳnh Anh legacy signature must be probed');
result = parser.applyRecognitionRule(quynhAnh, catalog, {
  [oldQuynhSignature]: { lines: [{ catalogKey: 'quynhanh-c7', perUnit: 4 }], savedAtMs: 1 }
});
assert(result.matched && result.perUnit === 4, 'saved Quỳnh Anh rule must apply');
assert.strictEqual(result.perUnit * quynhAnh.qty, 8, 'Quỳnh Anh Qty 2 must produce 8 plants total');

const ruby = { productName: 'Cây Ruby Đỏ', rawProductName: 'Cây Ruby Đỏ - Nắng màu đỏ rực phù hợp mọi không gian', sku: 'Combo 4 tặng 1', sellerSku: '', qty: 1 };
assert.strictEqual(parser.keyForProduct(ruby), 'ttp_12pc52j', 'Ruby mapping key must remain identical to V26.2.72');
const oldRubySignature = '{"v":2,"identityTokens":["do","rubi"],"sizes":[],"perUnit":5}';
assert(parser.legacyRecognitionSignatures(ruby).includes(oldRubySignature), 'legacy Ruby combo signature must remain available');
result = parser.applyRecognitionRule(ruby, catalog, {
  [oldRubySignature]: { lines: [{ catalogKey: 'rubi-c7', perUnit: 5 }], savedAtMs: 1 }
});
assert(result.matched && result.perUnit === 5, 'saved Ruby Combo 4 tặng 1 rule must apply');

const currentRule = { lines: [{ catalogKey: 'traliai-c9', perUnit: 2 }], savedAtMs: 2 };
result = parser.applyRecognitionRule(laiTra, catalog, { [parser.recognitionSignature(laiTra)]: currentRule, [oldLaiSignature]: { lines: [{ catalogKey: 'rubi-c7', perUnit: 5 }], savedAtMs: 1 } });
assert(result.matched && result.lines[0].catalogKey === 'traliai-c9', 'current range-specific signature must beat old fallback signature');
console.log('PASS V26.2.87 legacy recognition/backwards-compatibility tests');
