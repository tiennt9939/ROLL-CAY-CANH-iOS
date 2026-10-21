const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(ROOT, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(ROOT, 'tools/preflight.py'), 'utf8');

assert(/versionName\s*=\s*"26\.2\.92"/.test(gradle) && /versionCode\s*=\s*144/.test(gradle), 'multi-item order fix must increment Android metadata');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight metadata must match');
assert(html.includes("value=\"${outsideOrderCatalogSelectionValue(i)}\""), 'outside selector must use unique row tokens, not possibly duplicated catalog ids');
assert(html.includes('function resolveOutsideOrderCatalogSelection(value)'), 'outside selector token must resolve to the selected catalog row');
assert(html.includes('Number(x.plantIndex)===hit.i&&String(x.plantName||\'\')===name&&String(x.size||\'\')===size'), 'adding a line must merge only the exact same catalog row');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const nextFunction = html.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = html.indexOf('\nasync function ', start + 1);
  const stops = [nextFunction, nextAsyncFunction].filter(n => n >= 0);
  const end = stops.length ? Math.min(...stops) : html.length;
  return html.slice(start, end).trim();
}

const catalog = [
  { catalogId: 'legacy-duplicated-id', name: 'Nguyệt quế', size: 'C7', floorPrice: 0, price: 0 },
  { catalogId: 'legacy-duplicated-id', name: 'Quỳnh Anh', size: 'C9', floorPrice: 0, price: 0 },
  { catalogId: 'legacy-duplicated-id', name: 'Ổi lê', size: 'C11', floorPrice: 0, price: 0 }
];
const elements = {
  outsideOrderPlantChoice: { value: '', },
  outsideOrderPlantQty: { value: '1' },
  outsideOrderPlantSearch: { value: '' }
};
const addedMessages = [];
const context = {
  D: { catalog },
  outsideOrderDraftItems: [],
  $: id => elements[id] || null,
  activeCatalog: () => catalog.map((p, i) => ({ p, i })).filter(row => !row.p.deleted),
  catalogKey: (p, i) => String(p.catalogId || `row-${i}`),
  configuredMoneyValue: value => value === null || value === undefined || String(value).trim() === '' ? null : Number(value),
  wageNormalizeText: x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase(),
  renderOutsideOrderPlantOptions: () => {},
  renderOutsideOrderDraftRows: () => {},
  updateOutsideOrderWagePreview: () => {},
  toast: m => addedMessages.push(String(m)),
  console
};
vm.createContext(context);
vm.runInContext([
  extractFunction('outsideOrderCatalogSelectionValue'),
  extractFunction('resolveOutsideOrderCatalogSelection'),
  extractFunction('addOutsideOrderDraftItem'),
  extractFunction('resolveOrderPlantIndex'),
  extractFunction('orderItems'),
  'this._test = {outsideOrderCatalogSelectionValue, addOutsideOrderDraftItem, resolveOrderPlantIndex, orderItems};'
].join('\n'), context);

// Three selected catalog rows can share the same legacy catalogId and still remain distinct.
for (const [index, qty] of [[0, 2], [1, 2], [2, 1]]) {
  elements.outsideOrderPlantChoice.value = `outside-row:${index}`;
  elements.outsideOrderPlantQty.value = String(qty);
  context._test.addOutsideOrderDraftItem();
}
assert.strictEqual(context.outsideOrderDraftItems.length, 3, 'should retain three different plant/size rows');
assert.deepStrictEqual(context.outsideOrderDraftItems.map(x => [x.plantName, x.size, x.qty]), [
  ['Nguyệt quế', 'C7', 2], ['Quỳnh Anh', 'C9', 2], ['Ổi lê', 'C11', 1]
], 'should add 2 Nguyệt quế C7 + 2 Quỳnh Anh C9 + 1 Ổi lê C11');
assert.strictEqual(context.outsideOrderDraftItems.reduce((sum, x) => sum + x.qty, 0), 5, 'total order quantity must be 5');

// Saved lines must resolve to their own row instead of the first row sharing the duplicate ID.
const order = { items: context.outsideOrderDraftItems.map(x => ({ ...x })) };
const lineIndexes = context._test.orderItems(order).map(x => x.plantIndex);
assert.deepStrictEqual(Array.from(lineIndexes), [0, 1, 2], 'saved order lines should preserve distinct catalog row indexes');
assert.strictEqual(context._test.orderItems(order).reduce((sum, x) => sum + x.qty, 0), 5, 'saved order total must preserve all line quantities');
assert(addedMessages.every(x => x.includes('Đã thêm')), 'each selected line should show a successful add confirmation');
console.log('OUTSIDE TIKTOK MULTI-ITEM SELECTION / CATALOG-ID COLLISION TEST PASS');
