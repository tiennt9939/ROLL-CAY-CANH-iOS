'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');

const catalog = [
  {name:'Cẩm tú mai',size:'C7',_key:'ctm-c7'},
  {name:'Cẩm tú mai',size:'C9',_key:'ctm-c9'},
  {name:'Cẩm tú mai',size:'C11',_key:'ctm-c11'},
  {name:'Quỳnh Anh',size:'C7',_key:'qa-c7'},
  {name:'Quỳnh Anh',size:'C9',_key:'qa-c9'},
  {name:'Nguyệt quế Thái',size:'C7',_key:'nq-c7'},
  {name:'Ổi Lê Siêu Trái',size:'C9',_key:'oi-c9'},
  {name:'Ổi Lê Siêu Trái',size:'C10',_key:'oi-c10'}
];
const c6c7 = {
  productName:'Combo 5 cây cẩm tú mai thái C6, C7',
  rawProductName:'Combo 5 cây cẩm tú mai thái C6, C7- Cây ngoại thất',
  sku:'Combo 5', sellerSku:'cây cẩm tú mai C6', qty:1
};
assert.strictEqual(parser.isConfirmedCamTuMaiCombo5C6C7(c6c7), true);
assert.strictEqual(parser.isConfirmedCamTuMaiCombo5C6C7({...c6c7,productName:'Combo 4 cây cẩm tú mai C6, C7',sku:'Combo 4'}), false);
assert.strictEqual(parser.isConfirmedCamTuMaiCombo5C6C7({...c6c7,productName:'Combo 5 cây cẩm tú mai C6, C7, C9'}), false);
const c6c7QuickRule = {
  quickRule:true, enabled:true, aliases:['Combo 5 cây cẩm tú mai thái C6, C7'],
  lines:[{catalogKey:'ctm-c7',perUnit:5}]
};
const c6c7Result = parser.applyRecognitionRule(c6c7, catalog, {'quickrule-ctm':c6c7QuickRule});
assert.strictEqual(c6c7Result.matched, true, JSON.stringify(c6c7Result));
assert.strictEqual(c6c7Result.lines[0].size, 'C7');
assert.strictEqual(c6c7Result.perUnit, 5);
const c6c7Auto = parser.matchCatalogProduct(c6c7,catalog);
assert.strictEqual(c6c7Auto.matched,true,JSON.stringify(c6c7Auto));
assert.strictEqual(c6c7Auto.size,'C7');
const nonSpecial = parser.applyRecognitionRule({...c6c7,productName:'Combo 5 cây nguyệt quế C6, C7',rawProductName:'Combo 5 cây nguyệt quế C6, C7',sellerSku:'Nguyệt quế C6'}, catalog, {
  'quickrule-nq':{quickRule:true,enabled:true,aliases:['Combo 5 cây nguyệt quế C6, C7'],lines:[{catalogKey:'nq-c7',perUnit:5}]}
});
assert.strictEqual(nonSpecial.matched,false,'the mixed-size exception must not leak to other plant types');
assert.strictEqual(nonSpecial.needsReview,true);

const oiRange = {productName:'Ổi Lê Siêu Trái C9',rawProductName:'Ổi Lê Siêu Trái C9 -C10( đang sẵn trái )',sku:'Mặc định',sellerSku:'',qty:1};
assert.strictEqual(parser.isAdminResolvableProductNameSizeRange(oiRange),true);
assert.strictEqual(parser.isAdminResolvableProductNameSizeRange({...oiRange,sellerSku:'C11'}),false,'conflicting SKU size must not be overridden as a simple title range');
const oiC9Rule = {[parser.recognitionSignature(oiRange)]:{lines:[{catalogKey:'oi-c9',perUnit:1}],adminResolvedSizeConflict:true}};
const resolved = parser.applyRecognitionRule(oiRange,catalog,oiC9Rule);
assert.strictEqual(resolved.matched,true,JSON.stringify(resolved));
assert.strictEqual(resolved.lines[0].size,'C9');
const unresolved = parser.applyRecognitionRule(oiRange,catalog,{[parser.recognitionSignature(oiRange)]:{lines:[{catalogKey:'oi-c9',perUnit:1}]}});
assert.strictEqual(unresolved.matched,false,'a range must remain review-only until explicitly resolved by Admin');
assert.strictEqual(unresolved.needsReview,true);
const conflictingFields = {...oiRange, sku:'C11'};
const unsafeOverride = parser.applyRecognitionRule(conflictingFields,catalog,{[parser.recognitionSignature(conflictingFields)]:{lines:[{catalogKey:'oi-c9',perUnit:1}],adminResolvedSizeConflict:true}});
assert.strictEqual(unsafeOverride.matched,false,'the title-range override must not bypass an independent SKU size conflict');

// Actual PDF line for the user's new order does not print a Quỳnh Anh size (SKU is Mặc định).
// The app must not guess C9 from nothing; it must support an Admin-confirmed rule for that exact label.
const qaOrderLine={productName:'Combo 2 chậu quỳnh anh',rawProductName:'Combo 2 chậu quỳnh anh sẵn nụ hoa nở quanh năm + cây trang trí sân vườn',sku:'Mặc định',sellerSku:'',qty:1};
const qaAdminRule={[parser.recognitionSignature(qaOrderLine)]:{lines:[{catalogKey:'qa-c9',perUnit:2}]}};
const qaLearned=parser.applyRecognitionRule(qaOrderLine,catalog,qaAdminRule);
assert.strictEqual(qaLearned.matched,true,JSON.stringify(qaLearned));
assert.strictEqual(qaLearned.lines[0].catalogKey,'qa-c9',"an explicit Admin rule may preserve the user's confirmed Quỳnh Anh C9 choice even though the PDF label omits size");
assert.strictEqual(qaLearned.perUnit,2,'Combo 2 Quỳnh Anh has two plants per sold unit');

const functionStart = html.indexOf('function tiktokMappingMatchesExplicitSize(');
const functionEnd = html.indexOf('\nfunction autoMapTikTokProductMappings()', functionStart);
assert(functionStart>=0&&functionEnd>functionStart,'mapping size validator not found');
const sizeValidatorSource = html.slice(functionStart,functionEnd).trim();
const rows = catalog.map((p,i)=>({p,i,key:p._key}));
const sizeValidator = vm.runInNewContext(`(${sizeValidatorSource})`, {
  window:{TikTokLabelImport:parser},
  tiktokCatalogMatcherRows:()=>rows
});
assert.strictEqual(sizeValidator(c6c7,[{catalogKey:'ctm-c7',perUnit:5}]),true,'UI validation must allow only the exact Combo 5 C6/C7 → C7 rule');
assert.strictEqual(sizeValidator({...c6c7,productName:'Combo 5 cây cẩm tú mai C6, C7, C9'},[{catalogKey:'ctm-c7',perUnit:5}]),false);
assert.strictEqual(sizeValidator(oiRange,[{catalogKey:'oi-c9',perUnit:1}]),false,'a size range must not be auto-accepted');
assert.strictEqual(sizeValidator(oiRange,[{catalogKey:'oi-c9',perUnit:1,adminResolvedSizeConflict:true}]),true,'Admin-confirmed C9 selection inside the printed C9-C10 range may be reused');
assert.strictEqual(sizeValidator(oiRange,[{catalogKey:'oi-c11',perUnit:1,adminResolvedSizeConflict:true}]),false,'Admin range override cannot select a size absent from the range');
const c11Product={productName:'Cẩm tú mai VIP C11',rawProductName:'Cẩm tú mai VIP C11',sku:'Mặc định',sellerSku:'',qty:1};
assert.strictEqual(sizeValidator(c11Product,[{catalogKey:'ctm-c9',perUnit:1}]),false,'C11 must never be mapped to C9');
assert(html.includes('if(rule.adminResolvedSizeConflict===true)safe[signature].adminResolvedSizeConflict=true'), 'Admin-confirmed size-range rule must survive Cloud sanitizer');
console.log('TIKTOK SIZE VALIDATION PASS: confirmed C6/C7 exception, explicit Admin range resolution, C11 strictness');
