'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');

assert(/versionName = "[0-9]+(?:\.[0-9]+)+"/.test(gradle) && /versionCode = [124-9]+/.test(gradle), 'Android versionName and versionCode must be present');
assert(html.includes('id="editPlantFloorPrice"'), 'Floor-price field must be present in the plant editor');
assert(html.includes("const canEditFloorPrice=role==='admin'"), 'Floor-price field must be limited to Admin');
assert(html.includes('function calculateDailyProfitSummary('), 'Daily profit calculator missing');
assert(html.includes('function saveDailyMaterialExpense()'), 'Daily material expense editor missing');
assert(html.includes('materialExpensesByDate'), 'Daily material expense state missing');

const start = html.indexOf('function emptyDailyProfitBucket(');
const end = html.indexOf('function renderDailyProfitPanel(', start);
assert(start >= 0 && end > start, 'Could not isolate daily-profit calculation helpers');
const helperSource = html.slice(start, end);
const ctx = {
  D: {
    catalog: [
      { name: 'Cây A', size: 'C7', price: 100, floorPrice: 250 },
      { name: 'Cây B', size: 'C9', price: 50 }
    ],
    daily: [
      { date: '2026-10-01', plantIndex: 0, counts: { 'NV A': 2 }, purchaseCostSnapshot: 100, floorPriceSnapshot: 200 },
      { date: '2026-10-02', plantIndex: 1, counts: { 'NV B': 2 }, purchaseCostSnapshot: 50, floorPriceSnapshot: null }
    ],
    materialExpensesByDate: { '2026-10-01': { amount: 30, note: 'Bầu + đất' } }
  },
  configuredMoneyValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  },
  outOf(row) { return Object.values(row?.counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0); },
  payOf(row) { return Object.values(row?.counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0) * 20; },
  orderItems(row) { return Array.isArray(row?.items) ? row.items : []; },
  resolveOrderPlantIndex(item) { return Number(item?.plantIndex); },
  packerPay(row) { return Number(row.wageCost) || 0; },
  completedOrderRecords() {
    return [{
      id: 'order-1', date: '2026-10-01', status: 'completed', wageCost: 25,
      items: [{ plantIndex: 0, plantName: 'Cây A', size: 'C7', qty: 3, assignedFloorPrice: 220, assignedPurchaseCost: 90 }]
    }];
  },
  addDays(date, amount) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + amount);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
};
vm.createContext(ctx);
vm.runInContext(helperSource, ctx, { filename: 'daily-profit-helpers.js' });
const summary = ctx.calculateDailyProfitSummary('2026-10-01', '2026-10-02');
const day1 = summary.byDate['2026-10-01'];
const day2 = summary.byDate['2026-10-02'];
assert.strictEqual(day1.packedQty, 5, 'Day 1 quantities from manual record and completed order should aggregate');
assert.strictEqual(day1.completedOrders, 1, 'Completed order count should be retained');
assert.strictEqual(day1.floorRevenue, 1060, 'Use floor-price snapshots for manual records and assigned order snapshots');
assert.strictEqual(day1.plantCost, 470, 'Use purchase-cost snapshots for packed plant quantities');
assert.strictEqual(day1.laborCost, 65, 'Deduct daily manual wages plus completed-order wages');
assert.strictEqual(day1.materialCost, 30, 'Deduct daily material expenses');
assert.strictEqual(day1.profit, 495, 'Daily profit should equal floor revenue minus plant cost, wages and materials');
assert.strictEqual(day2.missingFloorQty, 2, 'Warn for packed plants without floor price');
assert.strictEqual(day2.floorRevenue, 0, 'Do not invent sales revenue when floor price is not set');
assert.strictEqual(day2.plantCost, 100, 'Plant cost still counts when floor price is missing');
assert.strictEqual(day2.profit, -140, 'Missing floor-price day should show costs and negative profit, not false revenue');
assert.strictEqual(summary.totals.floorRevenue, 1060);
assert.strictEqual(summary.totals.plantCost, 570);
assert.strictEqual(summary.totals.laborCost, 105);
assert.strictEqual(summary.totals.materialCost, 30);
assert.strictEqual(summary.totals.missingFloorQty, 2);
assert.strictEqual(summary.totals.profit, 355);

// Floor price is an internal valuation only. It must never appear in quotation/catalog price exports.
function functionSlice(startText, endText) {
  const a = html.indexOf(startText);
  const b = html.indexOf(endText, a + startText.length);
  assert(a >= 0 && b > a, `Cannot isolate ${startText}`);
  return html.slice(a, b);
}
const quoteCsv = functionSlice('function exportQuoteCsv(){', 'window.finishQuotePdfExport=');
const quotePdf = functionSlice('function exportQuotePdf(){', 'function applyPermissionsUI(){');
const catalogCsv = functionSlice('function exportCatalogPriceCsv(){', 'function exportCatalogPricePdf(){');
const catalogPdf = functionSlice('function exportCatalogPricePdf(){', 'function openImageSrc(');
for (const [name, snippet] of [['quotation CSV', quoteCsv], ['quotation PDF', quotePdf], ['catalog CSV', catalogCsv], ['catalog PDF', catalogPdf]]) {
  assert(!snippet.includes('floorPrice') && !snippet.includes('Giá bán sàn'), `${name} must not expose the internal floor price`);
}
console.log('DAILY PROFIT TEST PASS: floor-price revenue, plant cost, wage cost, materials, missing-price warning, Admin-only field, and no floor-price in any quote/catalog export.');
