'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');

function section(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert(start >= 0 && end > start, `Missing source section: ${startText}`);
  return html.slice(start, end);
}

const catalog = [
  { key:'qa-c9', p:{catalogId:'qa-9',name:'Quỳnh Anh',size:'C9',price:12000,floorPrice:18000}, i:0 },
  { key:'ng-c7', p:{catalogId:'ng-7',name:'Nguyệt quế Thái',size:'C7',price:9000,floorPrice:15000}, i:1 },
  { key:'oi-c9', p:{catalogId:'oi-9',name:'Ổi Lê Siêu Trái',size:'C9',price:15000,floorPrice:25000}, i:2 },
];
const context = {
  normalizeTracking: v => String(v || '').replace(/[^a-z0-9]/gi, '').toUpperCase(),
  findCatalogByKey: key => { const found=catalog.find(row=>row.key===String(key)); return found?{p:found.p,i:found.i}:null; },
  catalogKey: (plant,index) => catalog.find(row=>row.p===plant)?.key || `catalog-${index}`,
  tiktokProductMappingLines: () => [],
  tiktokMappingIsValid: () => false,
};
vm.createContext(context);
vm.runInContext(
  section('function tiktokLabelCompositionOverrideItems(row){','function orderCompositionRowHtml(item={}){') +
  section('function tiktokLabelMappedItems(row){','function normalizeTikTokSurplusText(value)'),
  context
);

const row = {
  orderId:'586670402637104154', trackingNo:'VNGH80293690511', status:'ready',
  products:[
    {productName:'Combo 2 chậu Quỳnh Anh',sku:'Mặc định',qty:1,mapKey:'unmapped-qa'},
    {productName:'Nguyệt quế Thái',sku:'2 chậu C7 cao 15–20cm',qty:1,mapKey:'unmapped-ng'},
    {productName:'Ổi Lê Siêu Trái C9-C10',sku:'Mặc định',qty:1,mapKey:'unmapped-oi'},
  ],
  manualPlantCompositionOverride:{
    adminConfirmed:true,reason:'Đối chiếu đơn thật; chọn đủ ba dòng cây và quy cách.',
    orderId:'586670402637104154',trackingNo:'VNGH80293690511',
    items:[{catalogKey:'qa-c9',qty:2},{catalogKey:'ng-c7',qty:2},{catalogKey:'oi-c9',qty:1}]
  }
};
const resolved = context.tiktokLabelCompositionOverrideItems(row);
assert(Array.isArray(resolved), 'valid, Admin-confirmed composition should validate');
assert.deepStrictEqual(Array.from(resolved, item=>item.qty), [2,2,1]);
assert.strictEqual(resolved.reduce((sum,item)=>sum+item.qty,0),5);
const orderItems = context.tiktokLabelMappedItems(row);
assert.deepStrictEqual(Array.from(orderItems, item=>item.plantName), ['Quỳnh Anh','Nguyệt quế Thái','Ổi Lê Siêu Trái']);
assert.deepStrictEqual(Array.from(orderItems, item=>item.qty), [2,2,1]);
assert.strictEqual(orderItems.reduce((sum,item)=>sum+item.qty,0),5,'manual quantities are final order totals; PDF Qty must not be multiplied again');

assert.strictEqual(context.tiktokLabelCompositionOverrideItems({...row,orderId:'OTHER'}), null, 'override cannot migrate to another Order ID');
assert.strictEqual(context.tiktokLabelCompositionOverrideItems({...row,trackingNo:'OTHER-TRACKING'}), null, 'override cannot migrate to another shipment');
assert.strictEqual(context.tiktokLabelCompositionOverrideItems({...row,manualPlantCompositionOverride:{...row.manualPlantCompositionOverride,reason:'bad'}}), null, 'reason is required');
assert.strictEqual(context.tiktokLabelCompositionOverrideItems({...row,manualPlantCompositionOverride:{...row.manualPlantCompositionOverride,adminConfirmed:false}}), null, 'Admin must explicitly confirm the full order composition');
assert.strictEqual(context.tiktokLabelCompositionOverrideItems({...row,manualPlantCompositionOverride:{...row.manualPlantCompositionOverride,items:[{catalogKey:'missing',qty:1}]}}), null, 'unknown catalog rows must not be accepted');

const selectorContext = {
  normalizeTracking: context.normalizeTracking,
  tiktokBulkAssignBusy:false,tiktokQueueBusy:{},
  tiktokLabelOrderCompositionIsValid: r => Array.isArray(context.tiktokLabelCompositionOverrideItems(r)),
  tiktokLiveOrderForLabel:()=>null,
  getTikTokDeliverySurplusCandidates:()=>[],
  tiktokMappingIsValid:()=>false,
};
vm.createContext(selectorContext);
vm.runInContext(section('function tiktokLabelIsSelectable(row){','function updateTikTokBulkToolbarState(){'), selectorContext);
assert.strictEqual(selectorContext.tiktokLabelIsSelectable(row),true,'Admin-confirmed one-order mapping can proceed even if reusable per-product rules are unresolved');
assert.strictEqual(selectorContext.tiktokLabelIsSelectable({...row,status:'assigned'}),false,'existing orders cannot be reassigned by bulk selection');

assert(html.includes('🌿 GỘP CÂY THEO ORDER ID RIÊNG ĐƠN NÀY'));
assert(html.includes('＋ CHỌN THÊM LOẠI CÂY TRONG ĐƠN NÀY'));
assert(html.includes('Qty đã tính rồi; không nhân lại.') || html.includes('KHÔNG nhân Qty PDF lần nữa'));
console.log('ORDER-SPECIFIC MULTI-PLANT COMPOSITION OVERRIDE TEST PASS: scoped by Order ID + tracking, full-list Admin confirmation, no double Qty, selectable only before order creation');
