const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'app/src/main/assets/data.json'), 'utf8'));
const catalog = data.catalog.map((p, i) => ({ ...p, _index: i, _key: `row-${i}` }));
const match = p => parser.matchCatalogProduct(p, catalog);

// Exact raw PDF size must win, even if the display/cleaned name omits the size.
const product = { productName: 'Cẩm tú mai VIP', rawProductName: 'Cẩm tú mai VIP C11', sku: 'Mặc định', sellerSku: '', qty: 2 };
const found = match(product);
assert.strictEqual(found.matched, true, JSON.stringify(found));
assert.strictEqual(found.size, 'C11');
assert.strictEqual(found.perUnit, 1);
assert.strictEqual(found.perUnit * product.qty, 2);

// A learned C9 rule cannot override C11 evidence from the raw PDF cell.
const c9 = catalog.find(p => /cẩm tú mai/i.test(p.name) && p.size === 'C9');
assert(c9);
const learned = { [parser.recognitionSignature(product)]: { lines: [{ catalogKey: c9._key, perUnit: 1 }] } };
const stale = parser.applyRecognitionRule(product, catalog, learned);
assert.strictEqual(stale.matched, false);
assert.strictEqual(stale.needsReview, true);

// Qty is multiplied once. A product with SKU Mặc định has one plant/unit; explicit Combo 2 or SKU 2 chậu can define two plants/unit.
assert.strictEqual(parser.expectedPlantsPerSoldUnit({ productName: 'Cẩm tú mai VIP C11', sku: 'Mặc định', qty: 2 }), 1);
assert.strictEqual(parser.expectedPlantsPerSoldUnit({ productName: 'Cẩm tú mai VIP C11', sku: '2 chậu C11', qty: 2 }), 2, 'explicit two-pot SKU remains two plants per unit');
assert.strictEqual(parser.expectedPlantsPerSoldUnit({ productName: 'Combo 2 chậu Cẩm tú mai C11', sku: 'Mặc định', qty: 2 }), 2);
assert(html.includes("[product?.rawProductName,product?.productName,product?.sku,product?.sellerSku].flatMap(v=>api.sizeTokens(v||''))"), 'manual/auto mapping must validate size evidence from raw PDF product name');
assert(html.includes('if(allSizes.length>1){') && html.includes('api.isConfirmedCamTuMaiCombo5C6C7?.(product)') && html.includes('adminResolvedSizeConflict===true'), 'only the confirmed C6/C7 exception or an explicit Admin-resolved product-name range may bypass multi-size review');
assert(html.includes('const expected=Math.max(1,Number(window.TikTokLabelImport?.expectedPlantsPerSoldUnit?.(product)||0));'), 'mapping validity must default to one plant/unit when no bundle is explicit');
console.log('PASS TikTok PDF C11 exact-size guard and Qty single-multiplication regression');
