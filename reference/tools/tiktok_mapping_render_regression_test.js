const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const start = html.indexOf('function renderTikTokProductMappings(){');
const end = html.indexOf('\nfunction resetTikTokProductMapToSinglePlant', start);
assert(start >= 0 && end > start, 'mapping renderer source must exist');
const renderer = html.slice(start, end);
const box = { innerHTML: '' };
const orderRow = {
  trackingNo: 'VNGH80293690511', orderId: '586670402637104154', page: 10,
  sourcePages: [10, 11], status: 'needs_review', products: [
    { productName: 'Combo 2 chậu quỳnh anh sẵn nụ hoa nở quanh năm' },
    { productName: 'Nguyệt quế thái C7' },
    { productName: 'Ổi Lê Siêu Trái C9-C10' },
  ],
};
const product = { mapKey: 'map_oi_le', productName: 'Ổi Lê Siêu Trái C9-C10', rawProductName: 'Ổi Lê Siêu Trái C9-C10', sku: 'Mặc định', sellerSku: '', qty: 1 };
const context = {
  window: { TikTokLabelImport: { expectedPlantsPerSoldUnit: () => 1 } },
  $: (id) => id === 'tiktokProductMappingList' ? box : null,
  tiktokUniqueProducts: () => [{ key: 'map_oi_le', product, orderRows: [orderRow] }],
  tiktokProductMappingLines: () => [],
  tiktokMappingIsValid: () => false,
  tiktokCatalogMatch: () => ({ matched: false, candidates: [{ name: 'Ổi Lê', size: 'C9', key: 'plant_oi_le_c9' }], reason: 'Chưa khớp size đơn nhất' }),
  tiktokRelatedMultiProductOrders: (entry) => Array.isArray(entry?.orderRows) ? entry.orderRows : [],
  tiktokProductLooksLikeBundle: () => false,
  tiktokProductCountConflict: () => null,
  tiktokRecognitionSignatureKeys: () => [],
  tiktokRecognitionRules: {},
  tiktokRecognitionRulesCloudError: '',
  findCatalogByKey: () => null,
  normalizeTracking: (value) => String(value || ''),
  esc: (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
vm.runInNewContext(renderer, context, { filename: 'renderTikTokProductMappings.js' });
assert.doesNotThrow(() => context.renderTikTokProductMappings(), 'mapping view must not throw if each product object includes orderRows');
assert(box.innerHTML.includes('Ổi Lê Siêu Trái C9-C10'), 'mapping list should visibly render the unresolved product card');
assert(box.innerHTML.includes('Cùng Order ID có 3 dòng sản phẩm'), 'mapping card should expose full-order composition control for the same Order ID');
assert(box.innerHTML.includes('GỘP CÂY RIÊNG ORDER ID 37104154'), 'Admin should be able to open composition editor for the matching order');
assert(!box.innerHTML.includes('orderRows is not defined'), 'renderer must not surface the previous runtime ReferenceError');
console.log('TIKTOK MAPPING RENDER REGRESSION TEST PASS');
