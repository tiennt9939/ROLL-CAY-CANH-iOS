const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const initial = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/data.json'), 'utf8'));
const catalog = initial.catalog.map((p, i) => ({ ...p, _index: i, _key: `catalog-row-${i}` }));
function match(product) { return parser.matchCatalogProduct(product, catalog); }

// Ordinary items: match against the app catalog using product name plus SKU size.
const nqC9 = match({ productName: 'Nguyệt quế thái siêu hoa thơm', sku: '1 chậu C9', sellerSku: '', qty: 1 });
assert.strictEqual(nqC9.matched, true, JSON.stringify(nqC9));
assert.strictEqual(nqC9.name, 'Nguyệt quế thái');
assert.strictEqual(nqC9.size, 'C9');
assert.strictEqual(nqC9.perUnit, 1);

const nqC7 = match({ productName: 'Nguyệt quế thái siêu hoa thơm', sku: '1 chậu C7', sellerSku: '1000', qty: 1 });
assert.strictEqual(nqC7.matched, true, JSON.stringify(nqC7));
assert.strictEqual(nqC7.size, 'C7');

// Confirmed user height rules: Nguyệt quế 15–20 cm => C7; 20–30 cm => C9.
// Include real-world PDF column fragments where "thái" and the size evidence are split.
const nqHeightC7 = match({productName:'Nguyệt quế th cao 15-20cm',sku:'ai s',sellerSku:'iêu hoa thơm 1 chậu C7 1000',qty:1});
assert.strictEqual(nqHeightC7.matched,true,JSON.stringify(nqHeightC7));
assert.strictEqual(nqHeightC7.size,'C7');
assert.strictEqual(nqHeightC7.sizeSource,'sellerSku');
const nqHeightC9 = match({productName:'Nguyệt quế thái cao 20-30cm',sku:'ai s',sellerSku:'iêu hoa thơm 2 chậu C9',qty:1});
assert.strictEqual(nqHeightC9.matched,true,JSON.stringify(nqHeightC9));
assert.strictEqual(nqHeightC9.size,'C9');
assert.strictEqual(nqHeightC9.perUnit,2,'Explicit SKU 2 chậu means two plants per sold unit');
const nqHeightOnlyC7 = match({productName:'Nguyệt quế thái cao 15-20cm',sku:'',sellerSku:'',qty:1});
assert.strictEqual(nqHeightOnlyC7.matched,true,JSON.stringify(nqHeightOnlyC7));
assert.strictEqual(nqHeightOnlyC7.size,'C7');
const nqHeightConflict = match({productName:'Nguyệt quế thái cao 15-20cm',sku:'1 chậu C9',sellerSku:'',qty:1});
assert.strictEqual(nqHeightConflict.matched,false,'Contradictory height and explicit C9 must require manual review');
assert.strictEqual(nqHeightConflict.needsReview,true);
const unrelatedHeight = match({productName:'Hoa khác cao 15-20cm',sku:'',sellerSku:'',qty:1});
assert.strictEqual(unrelatedHeight.matched,false,'Height aliases must not be applied to other plant names');

// Confirmed business rule: Combo 5 Cẩm tú mai with C6/C7 evidence maps to catalog C7.
// Qty is the number of combo units: Qty 2 means 10 plants, not two plants.
const comboProduct = {
  productName: 'Combo 5 cây cẩm tú mai thái C6, Combo 5 C7- Cây ngoại thất, trang trí vườn, hoa màu độc đáo, rực rỡ',
  sku: 'Combo 5', sellerSku: 'cây cẩm tú mai C6', qty: 2
};
const combo = match(comboProduct);
assert.strictEqual(combo.matched, true, JSON.stringify(combo));
assert.strictEqual(combo.size, 'C7');
assert.strictEqual(combo.perUnit, 5);
assert.strictEqual(2 * combo.perUnit, 10, 'Qty 2 means 10 catalog plants, not two plants');
const comboAsShownInApp = match({
  productName:'Combo 5 cây cẩm tú mai thái C6, Combo 5 C7- Cây ngoại thất, trang trí vườn, cây cẩm hoa màu độc đáo, rực rỡ mai C',
  sku:'tú 6', sellerSku:'', qty:2
});
assert.strictEqual(comboAsShownInApp.matched,true,JSON.stringify(comboAsShownInApp));
assert.strictEqual(comboAsShownInApp.size,'C7');
assert.strictEqual(comboAsShownInApp.perUnit*2,10,'App screenshot example must map to five plants per combo and Qty 2 = ten plants');
assert.strictEqual(parser.stripProductDescription('Combo 5 cây cẩm tú mai C6,C7- Cây ngoại thất'), 'Combo 5 cây cẩm tú mai C6,C7');

// A manually confirmed ambiguous product can teach a persistent rule for comparable future labels.
const signature = parser.recognitionSignature(comboProduct);
assert(signature, 'recognition signature should be generated');
const c7CatalogRow = catalog.find(c => /cẩm tú mai/i.test(c.name) && String(c.size).toUpperCase() === 'C7');
assert(c7CatalogRow, 'Cẩm tú mai C7 must exist in the catalog fixture');
const savedRules = {[signature]: {lines:[{catalogKey:c7CatalogRow._key,perUnit:5}]}};
const sameRuleVariant = {
  productName: 'COMBO 5 Cẩm Tú Mai Thái C6, Combo 5 C7 - cây ngoại thất / mô tả mới',
  sku: 'Combo 5', sellerSku: 'Cây Cẩm Tú Mai C6', qty: 3
};
assert.strictEqual(parser.recognitionSignature(sameRuleVariant), signature, 'signature must ignore accents, case, punctuation and marketing suffix');
const learned = parser.applyRecognitionRule(sameRuleVariant, catalog, savedRules);
assert.strictEqual(learned.matched, true, JSON.stringify(learned));
assert.strictEqual(learned.learnedRule, true);
assert.strictEqual(learned.lines[0].size, 'C7');
assert.strictEqual(learned.lines[0].perUnit, 5);
assert.strictEqual(3 * learned.perUnit, 15);
const otherPlant = match({productName:'Combo 5 cây nguyệt quế thái C6, C7 - mô tả',sku:'Combo 5',sellerSku:'Nguyệt quế C6',qty:1});
assert.strictEqual(otherPlant.matched,false,'Cẩm tú mai exception must not apply to other plants');
const otherCombo = match({productName:'Combo 4 cây cẩm tú mai thái C6, C7 - mô tả',sku:'Combo 4',sellerSku:'Cẩm tú mai C6',qty:1});
assert.strictEqual(otherCombo.matched,false,'Combo count must be exactly five for this exception');
const extraSize = match({productName:'Combo 5 cây cẩm tú mai thái C6, C7, C9 - mô tả',sku:'Combo 5',sellerSku:'Cẩm tú mai C6',qty:1});
assert.strictEqual(extraSize.matched,false,'Other explicit sizes must continue to require review');
const changedSize = {...sameRuleVariant, sellerSku:'Cẩm tú mai C9'};
assert.strictEqual(parser.applyRecognitionRule(changedSize, catalog, savedRules).matched, false, 'rule must not leak to a different size signature');

// Regression: an old/local learned C7 mapping must never override an explicit C9 SKU.
const nqC9TwoPot = {productName:'Nguyệt quế thái siêu hoa thơm',sku:'2 chậu C9 cao 20-30cm',sellerSku:'',qty:1};
const nqC9Rows = catalog.filter(c => /nguyệt quế thái/i.test(c.name) && String(c.size).toUpperCase()==='C9');
assert.strictEqual(nqC9Rows.length,1,'Catalog fixture must have one Nguyệt quế Thái C9 row');
const staleC7Rule = {[parser.recognitionSignature(nqC9TwoPot)]: {lines:[{catalogKey:catalog.find(c => /nguyệt quế thái/i.test(c.name) && String(c.size).toUpperCase()==='C7')._key,perUnit:2}]}};
assert.strictEqual(parser.applyRecognitionRule(nqC9TwoPot,catalog,staleC7Rule).matched,false,'Stale C7 learned rule must be rejected when SKU explicitly says C9');
const nqC9TwoPotMatch = match(nqC9TwoPot);
assert.strictEqual(nqC9TwoPotMatch.matched,true,JSON.stringify(nqC9TwoPotMatch));
assert.strictEqual(nqC9TwoPotMatch.size,'C9','Explicit SKU C9 must beat the default-C7 rule');
assert.strictEqual(nqC9TwoPotMatch.perUnit,2,'Explicit SKU 2 chậu means two plants per sold unit');

// No size defaults to C7 only when that exact catalog size exists.
const noSizeCombo = match({ productName: 'Combo 2 chậu Vàng Bạc ( cây trang trí phong thuỷ sân vườn)', sku: 'Mặc định', sellerSku: '', qty: 1 });
assert.strictEqual(noSizeCombo.matched, true, JSON.stringify(noSizeCombo));
assert.strictEqual(noSizeCombo.size, 'C7');
assert.strictEqual(noSizeCombo.sizeSource, 'defaultC7');
assert.strictEqual(noSizeCombo.perUnit, 2);

// Label #1: Nguyệt quế Thái C7 SKU, Qty 1, no Combo => one plant.
const nqExample = match({productName:'Nguyệt quế thái siêu hoa thơm',sku:'1 chậu C7 cao 15-20cm',sellerSku:'1000',qty:1});
assert.strictEqual(nqExample.matched,true,JSON.stringify(nqExample));
assert.strictEqual(nqExample.size,'C7');
assert.strictEqual(nqExample.perUnit,1);

// Label #2: Phú Quý without size defaults to C7; Combo 2 × Qty 1 => 2 plants.
const phuQuy = match({productName:'Combo 2 chậu Phú Quý ( cây trang trí phong thủy)',sku:'Mặc định',sellerSku:'',qty:1});
assert.strictEqual(phuQuy.matched,true,JSON.stringify(phuQuy));
assert.strictEqual(phuQuy.size.toUpperCase(),'C7');
assert.strictEqual(phuQuy.perUnit,2);
assert.strictEqual(phuQuy.perUnit*1,2);

// Label #3: size C9 after dash is still evidence and must not be lost by SEO stripping.
const apple = match({productName:'Cây Táo Thái sản bông - trái nhỏ chậu C9',sku:'1 cây Táo Thái sản hoa - trái C9',sellerSku:'',qty:1});
assert.strictEqual(apple.matched,false,'Seed catalog has no explicit Táo Thái C9 row; do not silently map it to a blank-size row');
assert(/C9/.test(apple.reason));
assert.strictEqual(apple.perUnit,1);

// Explicit Product Name C9 and SKU C9 agree, and C9 after dash is retained.
const dashSize = match({productName:'Cây Táo Thái sản bông - trái nhỏ chậu C9',sku:'1 cây Táo Thái sản hoa - trái C9',sellerSku:'1000',qty:1});
assert.strictEqual(dashSize.needsReview,true);
assert(/C9/.test(dashSize.reason));

// Conflicting explicit sizes are always manual review, even if catalog only has one candidate.
const conflict = match({productName:'Nguyệt quế thái C7',sku:'1 chậu C9',sellerSku:'1000',qty:1});
assert.strictEqual(conflict.matched,false);
assert.strictEqual(conflict.needsReview,true);

// A no-size plant without a C7 catalog row must not auto-select a different size.
const noC7Catalog = match({productName:'Lài Tây',sku:'Mặc định',sellerSku:'',qty:1});
assert.strictEqual(noC7Catalog.matched,false);
assert.strictEqual(noC7Catalog.needsReview,true);

// Names without a catalog match must never create a synthetic catalog plant.
const unknown = match({ productName: 'Combo 3 cây Lan lạ chưa có trong danh mục', sku: 'Combo 3', sellerSku: '', qty: 1 });
assert.strictEqual(unknown.matched, false);
assert(/Không tìm thấy/.test(unknown.reason));

// Regression for reported Cẩm tú mai VIP C11: the raw PDF cell is authoritative for size,
// and a stale C9 learned mapping must be rejected rather than silently accepted.
const camTuMaiC11 = {productName:'Cẩm tú mai VIP',rawProductName:'Cẩm tú mai VIP C11',sku:'Mặc định',sellerSku:'',qty:2};
const c11Match = match(camTuMaiC11);
assert.strictEqual(c11Match.matched,true,JSON.stringify(c11Match));
assert.strictEqual(c11Match.size,'C11','Explicit raw PDF C11 must map only to C11');
assert.strictEqual(c11Match.perUnit,1,'Qty is not plants-per-unit');
assert.strictEqual(c11Match.perUnit*camTuMaiC11.qty,2,'Qty 2 for a single-plant unit must total two plants');
const c9Row = catalog.find(c=>/cẩm tú mai/i.test(c.name)&&String(c.size).toUpperCase()==='C9');
assert(c9Row,'Cẩm tú mai C9 fixture must exist');
const c9LearnedRule = {[parser.recognitionSignature(camTuMaiC11)]:{lines:[{catalogKey:c9Row._key,perUnit:1}]}};
const c9RuleResult = parser.applyRecognitionRule(camTuMaiC11,catalog,c9LearnedRule);
assert.strictEqual(c9RuleResult.matched,false,'A stale C9 mapping must never override raw PDF C11');
assert.strictEqual(c9RuleResult.needsReview,true);
const combo2 = match({productName:'Combo 2 chậu Cẩm tú mai C11',rawProductName:'Combo 2 chậu Cẩm tú mai C11',sku:'Mặc định',sellerSku:'',qty:2});
assert.strictEqual(combo2.matched,true,JSON.stringify(combo2));
assert.strictEqual(combo2.perUnit,2,'Explicit Combo 2 means two plants per sold unit');
assert.strictEqual(combo2.perUnit*2,4,'Combo 2 × Qty 2 must total four plants');
const rubyGift = match({productName:'Rubi 4 cây (tặng 1)',rawProductName:'Rubi 4 cây (tặng 1)',sku:'',sellerSku:'',qty:2});
assert.strictEqual(rubyGift.perUnit,5,'Explicit gift bundle remains 4 + 1');

console.log('TIKTOK CATALOG MATCHER TEST PASS: explicit C9 priority, stale-rule rejection, confirmed Combo 5 Cẩm tú mai C7, learned-rule reuse and ambiguity guard');
