const assert = require('assert');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const page = text => ({ page: 1, text });
const header = 'Product Name                                      SKU                Seller SKU                    Qty';
const singleProduct = `862512345678\nOrder ID: 586534686489019809\n${header}\n4 cây Quỳnh Anh                                    4 cây              QA-C7                         1\nQty Total: 2`;
const pageLevelRow = parser.parsePage(page(singleProduct));
assert.strictEqual(pageLevelRow.products[0].qty, 1, 'Page parser must preserve the Qty belonging to the individual product row');
const row = parser.parsePages([page(singleProduct)])[0];
assert.strictEqual(row.status, 'ready', JSON.stringify(row));
assert.strictEqual(row.products.length, 1);
assert.strictEqual(row.products[0].qty, 2, 'A single-page, single-product order can reconcile Qty against authoritative Qty Total=2 after grouping');
const plantsPerUnit = parser.expectedPlantsPerSoldUnit(row.products[0]);
assert.strictEqual(plantsPerUnit, 4, 'Four Quỳnh Anh plants per sold unit must be recognized');
assert.strictEqual(row.products[0].qty * plantsPerUnit, 8, 'Qty 2 × 4 plants per sold unit must become 8 physical plants');

const multiProduct = `862512345679\nOrder ID: 586534686489019810\n${header}\nQuỳnh Anh                                         1 cây              QA-C7                         1\nCẩm tú mai                                        1 cây              CTM-C7                        1\nQty Total: 3`;
const uncertain = parser.parsePage(page(multiProduct));
assert.strictEqual(uncertain.status, 'needs_review', 'Do not guess which row has wrong Qty in a multi-product order');
assert(/Qty Total/.test(uncertain.reviewReason));

const validMultiProduct = `862512345680\nOrder ID: 586534686489019811\n${header}\nQuỳnh Anh                                         1 cây              QA-C7                         1\nCẩm tú mai                                        1 cây              CTM-C7                        1\nQty Total: 2`;
assert.strictEqual(parser.parsePage(page(validMultiProduct)).status, 'ready', 'Matching multi-product Qty sum should remain ready');
console.log('TIKTOK QTY TOTAL RECONCILIATION PASS');
