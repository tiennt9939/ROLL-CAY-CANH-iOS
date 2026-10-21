
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

// Product Name contains the storefront title Combo 2; the explicit SKU count is authoritative (4 plants).
const mislabeled = {
  productName: 'Combo 2 chậu cẩm tú mai C9',
  rawProductName: 'Combo 2 chậu cẩm tú mai C9 (cây sẵn hoa + cao 25-40cm)',
  sku: 'Combo 4 chậu cẩm tú mai C9', sellerSku: 'Mặc định', qty: 1
};
assert.strictEqual(parser.explicitPlantsPerSoldUnitFromText(mislabeled.productName), 2, 'count detector reads the Product Name');
assert.strictEqual(parser.explicitPlantsPerSoldUnitFromText(mislabeled.sku), 4, 'count detector separately reads the mistaken SKU');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(mislabeled), 4, 'Explicit SKU count must win over the Combo number in Product Name');
assert.strictEqual(parser.legacyExpectedPlantsPerSoldUnit(mislabeled), 4, 'legacy signature lookup keeps old count semantics');
const mappedBySku = parser.applyRecognitionRule(mislabeled, [
  {name:'Cẩm tú mai',size:'C9',_key:'ctm-c9'}
], {quickrule_combo4:{quickRule:true,enabled:true,aliases:['Combo 2 chậu cẩm tú mai C9'],lines:[{catalogKey:'ctm-c9',perUnit:4}]}});
assert.strictEqual(mappedBySku.matched, true, JSON.stringify(mappedBySku));
assert.strictEqual(mappedBySku.perUnit, 4, 'the SKU says Combo 4, so four Cẩm tú mai C9 is correct');
assert.strictEqual(mappedBySku.adminCountOverride, false, 'a storefront title/SKU count difference alone is not an exception when SKU is the count source');

const catalog = [
  {name:'Quỳnh Anh',size:'C9',_key:'qa-c9'},
  {name:'Ổi Lê Siêu Trái',size:'C9',_key:'oi-c9'},
  {name:'Cẩm tú mai',size:'C9',_key:'ctm-c9'},
  {name:'Cẩm tú mai',size:'C7',_key:'ctm-c7'}
];

// One sold combo can consist of more than one catalog species; Qty is multiplied once.
const mixedProduct = {productName:'Combo 3 cây Quỳnh Anh và Ổi Lê C9',rawProductName:'Combo 3 cây Quỳnh Anh và Ổi Lê C9',sku:'Mặc định',sellerSku:'',qty:2};
const mixedRule = {quickRule:true,enabled:true,aliases:['Combo 3 cây Quỳnh Anh và Ổi Lê C9'],lines:[
  {catalogKey:'qa-c9',perUnit:2}, {catalogKey:'oi-c9',perUnit:1}
]};
const mixed = parser.applyRecognitionRule(mixedProduct,catalog,{quickrule_mixed:mixedRule});
assert.strictEqual(mixed.matched,true,JSON.stringify(mixed));
assert.strictEqual(mixed.lines.length,2);
assert.strictEqual(mixed.lines.reduce((sum,line)=>sum+line.perUnit,0),3);
assert.strictEqual(mixed.lines.reduce((sum,line)=>sum+line.perUnit,0)*mixedProduct.qty,6,'Qty multiplies the three-plant composition once');

// Count exception is accepted only when explicitly enabled and documented.
const countMismatch = {productName:'Cẩm tú mai C9',rawProductName:'Cẩm tú mai C9',sku:'Combo 4',sellerSku:'',qty:1};
const exceptionRule = {quickRule:true,enabled:true,aliases:['Cẩm tú mai C9'],lines:[{catalogKey:'ctm-c9',perUnit:2}],adminCountOverride:true,overrideReason:'Shop nhập nhầm SKU Combo 4; đơn thực tế là Combo 2'};
const accepted = parser.applyRecognitionRule(countMismatch,catalog,{quickrule_exception:exceptionRule});
assert.strictEqual(accepted.matched,true,JSON.stringify(accepted));
assert.strictEqual(accepted.perUnit,2);
assert.strictEqual(accepted.adminCountOverride,true);
const blocked = parser.applyRecognitionRule(countMismatch,catalog,{quickrule_no_exception:{...exceptionRule,adminCountOverride:false}});
assert.strictEqual(blocked.matched,true, 'without a valid exception, the explicit SKU count remains authoritative');
assert.strictEqual(blocked.perUnit,4, 'stale one-line rule count must refresh to SKU Combo 4');
assert.strictEqual(blocked.adminCountOverride,false, 'SKU-based count correction is not mislabeled as an Admin exception');
const noReason = parser.applyRecognitionRule(countMismatch,catalog,{quickrule_bad_reason:{...exceptionRule,overrideReason:'no'}});
assert.strictEqual(noReason.matched,true,'an invalid override reason must not take effect, but explicit SKU count still applies');
assert.strictEqual(noReason.perUnit,4);
assert.strictEqual(noReason.adminCountOverride,false);

assert(html.includes('function openTikTokQuickRuleEditorFromProduct(mapKey)'), 'Admin can start a rule from the actual PDF row');
assert(html.includes('function addTikTokQuickRuleMapRow'), 'Quick rule editor supports multiple plant types');
assert(html.includes('adminCountOverride===true&&String(rule.overrideReason||\'\').trim().length>=6'), 'Cloud save preserves count exception metadata');
assert(html.includes('＋ THÊM CÂY THÀNH PHẦN CHO SẢN PHẨM COMBO NÀY'), 'mapping panel can add plant types only to a reusable bundle product');
assert(html.includes('GỘP CÂY RIÊNG ORDER ID'), 'product mapping panel links to order-scoped composition for multi-row orders');
assert(html.includes('quy tắc dùng chung sai'), 'multi-species non-bundle mappings must be routed away from shared product rules');
assert(html.includes('tiktokProductCountConflict'), 'mapping screen detects Product Name versus SKU count conflicts');
assert(html.includes('＋ CHỌN THÊM LOẠI CÂY VÀO COMBO NÀY'), 'rule editor lets Admin add more plant species to one combo');
assert(html.includes('LỆCH SỐ COMBO') && html.includes('App ưu tiên SKU'), 'rule editor shows label/SKU evidence instead of leaving Admin to guess');
assert(html.includes('function openTikTokOrderCompositionEditor(trackingNo)'), 'Admin can override the full composition of one real order');
assert(html.includes('function saveTikTokOrderCompositionOverride(trackingNo)'), 'one-order composition is saved only after explicit confirmation');
assert(html.includes('manualPlantCompositionOverride'), 'per-order composition override is attached to the local label record');
assert(html.includes('🌿 GỘP CÂY THEO ORDER ID RIÊNG ĐƠN NÀY'), 'queue shows a contextual one-order composition action');
assert(html.includes('toàn bộ số cây thực tế của cả đơn sau khi đã tính Qty PDF'), 'UI makes clear manual counts are final totals after Qty');
console.log('ADMIN MULTI-PLANT + SKU-FIRST COUNT + AUDITED OVERRIDE TEST PASS');
