const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../app/src/main/assets/tiktok-label-import.js');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

const catalog = [
  { key: 'plant_quynhanh_c7', i: 0, p: { catalogId: 'plant_quynhanh_c7', name: 'Quỳnh Anh', size: 'C7' } },
  { key: 'plant_quynhanh_c9', i: 1, p: { catalogId: 'plant_quynhanh_c9', name: 'Quỳnh Anh', size: 'C9' } },
  { key: 'plant_rubi_c7', i: 2, p: { catalogId: 'plant_rubi_c7', name: 'Rubi đỏ', size: 'C7' } },
];
const quynhRule = {
  quickRule: true, enabled: true, aliases: ['quỳnh anh', 'quỳnh anh 4 cây c7', 'quynh anh 4 cay c7'],
  lines: [{ catalogKey: 'plant_quynhanh_c7', perUnit: 4 }],
};
let result = api.applyRecognitionRule({ productName: 'Quỳnh Anh', qty: 2 }, catalog, { quickrule_quynhanh: quynhRule });
assert.strictEqual(result.matched, false, 'must not infer four plants per unit when the label omits a bundle/count');
assert.strictEqual(result.needsReview, true, 'uncounted product with a four-plant learned rule must be reviewed');

result = api.applyRecognitionRule({ productName: 'QUYNH ANH 4 CAY C7', sku: '4 cây C7', qty: 2 }, catalog, { quickrule_quynhanh: quynhRule });
assert.strictEqual(result.matched, true, 'keyword matching ignores Vietnamese diacritics and case');
assert.strictEqual(2 * result.perUnit, 8, 'explicit four-plant unit still reconciles with Qty');

result = api.applyRecognitionRule({ productName: 'Combo của tháng 4 chậu Quỳnh Anh', sku: 'Mặc định', qty: 2 }, catalog, { quickrule_quynhanh: quynhRule });
assert.strictEqual(result.matched, true, JSON.stringify(result));
assert.strictEqual(result.perUnit, 4, 'the actual “Combo của tháng 4 chậu Quỳnh Anh” label states four plants per sold unit');
assert.strictEqual(result.perUnit * 2, 8, 'PDF Qty=2 must multiply the learned four-plant unit once');

result = api.applyRecognitionRule({ productName: 'Quỳnh Anh 5 cây C7', sku: '5 cây C7', qty: 2 }, catalog, { quickrule_quynhanh: quynhRule });
assert.strictEqual(result.matched, true, `explicit SKU count 5 must override a stale single-line rule count: ${JSON.stringify(result)}`);
assert.strictEqual(result.perUnit, 5, 'single-line mapping keeps the selected plant and uses explicit SKU quantity 5');

result = api.applyRecognitionRule({ productName: 'Quỳnh Anh 4 cây C9', sku: '4 cây C9', qty: 2 }, catalog, { quickrule_quynhanh: quynhRule });
assert.strictEqual(result.needsReview, true, 'explicit C9 must not map to C7');

result = api.applyRecognitionRule({ productName: 'Quỳnh Anh', qty: 1 }, catalog, {
  quickrule_a: quynhRule,
  quickrule_b: { quickRule: true, enabled: true, aliases: ['quỳnh anh', 'quỳnh anh 4 cây c7'], lines: [{ catalogKey: 'plant_quynhanh_c9', perUnit: 4 }] },
});
assert.strictEqual(result.needsReview, true, 'conflicting equally-specific quick rules must not guess');

result = api.applyRecognitionRule({ productName: 'Quỳnh Anh', qty: 2 }, catalog, { quickrule_off: { ...quynhRule, enabled: false } });
assert.strictEqual(result.matched, false, 'disabled rule must not be applied');

assert(html.includes('safe[signature].quickRule=true') && html.includes('safe[signature].aliases=aliases') && html.includes('safe[signature].enabled=rule.enabled!==false'), 'Cloud sanitizer must preserve quick-rule metadata');
assert(html.includes('function openTikTokQuickRuleManager()'), 'Admin needs a dedicated in-app quick-rule manager');
assert(html.includes('function saveTikTokQuickRule()'), 'quick rules must be editable and saved from the UI');
assert(html.includes('await persistTikTokRecognitionRulesToCloud()'), 'quick rule changes must sync to existing shared Cloud config');
assert(html.includes("if(learned?.matched||learned?.needsReview)return learned"), 'unsafe quick-rule conflicts must stop normal fallback guessing');
assert(html.includes("quickRulesButton=$('tiktokQuickRulesButton')"), 'quick-rule manager entry should be Admin-controlled');

// New regression: quick rules must still match a real storefront title when TikTok inserts
// short descriptive words between the plant name and size. Count and size guards remain active.
const camTuMaiCatalog = [
  { key: 'plant_cam_tu_mai_c7', i: 0, p: { catalogId: 'plant_cam_tu_mai_c7', name: 'Cẩm tú mai', size: 'C7' } },
  { key: 'plant_cam_tu_mai_c9', i: 1, p: { catalogId: 'plant_cam_tu_mai_c9', name: 'Cẩm tú mai', size: 'C9' } },
];
const c67Product = {
  productName: 'Combo 5 cây cẩm tú mai thái C6, C7- Cây ngoại thất, trang trí vườn',
  rawProductName: 'Combo 5 cây cẩm tú mai thái C6, C7- Cây ngoại thất, trang trí vườn',
  sku: 'Combo 5', sellerSku: 'cây cẩm tú mai C6', qty: 1,
};
result = api.applyRecognitionRule(c67Product, camTuMaiCatalog, {
  quickrule_cam_tu_mai: { quickRule: true, enabled: true, aliases: ['Cẩm tú mai C6'], lines: [{ catalogKey: 'plant_cam_tu_mai_c7', perUnit: 5 }] },
});
assert.strictEqual(result.matched, true, `Cẩm tú mai alias should tolerate inserted “thái”: ${JSON.stringify(result)}`);
assert.strictEqual(result.perUnit, 5, 'SKU Combo 5 remains the sold-unit count for C6/C7 exception');

const c9Product = {
  productName: 'Combo 2 chậu cẩm tú mai siêu hoa C9 - cây trang trí sân vườn',
  rawProductName: 'Combo 2 chậu cẩm tú mai siêu hoa C9 - cây trang trí sân vườn',
  sku: 'Combo 4 chậu cẩm tú mai C9 25-40cm', sellerSku: 'Mặc định', qty: 1,
};
result = api.applyRecognitionRule(c9Product, camTuMaiCatalog, {
  quickrule_cam_tu_mai_c9: { quickRule: true, enabled: true, aliases: ['Combo 2 cẩm tú mai C9'], lines: [{ catalogKey: 'plant_cam_tu_mai_c9', perUnit: 4 }] },
});
assert.strictEqual(result.matched, true, `Combo 2 title / Combo 4 SKU rule should apply with the SKU count: ${JSON.stringify(result)}`);
assert.strictEqual(result.perUnit, 4, 'SKU Combo 4 takes precedence over Combo 2 words in Product Name');
assert.strictEqual(api.expectedPlantsPerSoldUnit(c9Product), 4, 'SKU remains the quantity source; title is product identity');
// An existing Admin rule may have been saved when the combo title was mistakenly treated
// as quantity 2. The matcher must keep the chosen C9 catalog row and refresh only the count
// from an explicit SKU Combo 4, instead of leaving the rule unapplied.
result = api.applyRecognitionRule(c9Product, camTuMaiCatalog, {
  quickrule_cam_tu_mai_c9_old: { quickRule: true, enabled: true, title: 'Combo 2 cẩm tú mai C9', aliases: ['Combo 2 cẩm tú mai C9'], lines: [{ catalogKey: 'plant_cam_tu_mai_c9', perUnit: 2 }] },
});
assert.strictEqual(result.matched, true, `old Combo 2 title rule must apply using SKU count: ${JSON.stringify(result)}`);
assert.strictEqual(result.lines[0].perUnit, 4, 'explicit SKU count must update a single-line mapping from 2 to 4 plants/unit');
assert.strictEqual(result.perUnit, 4, 'resolved rule total must match SKU Combo 4');

const c11Catalog = [{ key: 'plant_cam_tu_mai_c11', i: 0, p: { catalogId: 'plant_cam_tu_mai_c11', name: 'Cẩm tú mai', size: 'C11' } }];
const c11Product = { productName: 'Hàng Vjp Chậu Cẩm tú mai C11 size to cây trang trí sân vườn', rawProductName: 'Hàng Vjp Chậu Cẩm tú mai C11 size to cây trang trí sân vườn', sku: 'Mặc định', sellerSku: 'Mặc định', qty: 2 };
result = api.applyRecognitionRule(c11Product, c11Catalog, {
  quickrule_c11: { quickRule: true, enabled: true, title: 'Cẩm tú mai C11', aliases: ['Cẩm tú mai vip'], lines: [{ catalogKey: 'plant_cam_tu_mai_c11', perUnit: 1 }] },
});
assert.strictEqual(result.matched, true, `Admin's precise rule title should act as a fallback alias while explicit C11 remains guarded: ${JSON.stringify(result)}`);
assert.strictEqual(result.lines[0].size, 'C11', 'the rule must preserve exact C11 catalog size');

console.log('TIKTOK QUICK RECOGNITION RULES TEST PASS');
