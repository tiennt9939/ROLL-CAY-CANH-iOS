'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html','utf8');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
function section(startText,endText){const start=html.indexOf(startText);const end=html.indexOf(endText,start);assert(start>=0&&end>start,`Missing ${startText}`);return html.slice(start,end)}

// Parser source must retain status from parsePages rather than replacing it with a UI staging value.
assert(html.includes('const parserStatus=label.status===\'ready\'?\'ready\':\'needs_review\';'));
assert(html.includes('status:parserStatus,packingOrderId:\'\',existingOrder:false'));
assert(!html.includes("status:'daily_import',packingOrderId:''"),'fresh parsed queue row must not lose parser ready/review status');
assert(html.includes('pdfParserStatus=parserStatus;prior.status=parserStatus'),'reimport must refresh ready/review state for an unlinked queue row');

// Legacy staging rows from earlier candidates may be promoted only if their parse evidence is complete.
const normalizeFn = section('function normalizeTikTokQueueImportStatuses(){','function tiktokUniqueProducts(){');
let saved=0;
const rows=[
  {status:'daily_import',trackingNo:'VNGH80293690511',orderId:'586670402637104154',products:[{productName:'a'}],reviewReason:''},
  {status:'daily_import',trackingNo:'T2',orderId:'ID2',products:[{productName:'b'}],reviewReason:'Mã vận đơn trùng trong cùng PDF'},
  {status:'daily_import',trackingNo:'T3',orderId:'ID3',products:[],reviewReason:''},
  {status:'daily_import',trackingNo:'T4',orderId:'ID4',products:[{productName:'c'}],reviewReason:'',packingOrderId:'REAL'}
];
const normContext={tiktokLabelQueue:rows,normalizeTracking:v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase(),saveTikTokLocalState:()=>{saved++;return true}};
vm.createContext(normContext);vm.runInContext(normalizeFn+';this.normalizeTikTokQueueImportStatuses=normalizeTikTokQueueImportStatuses;',normContext);
normContext.normalizeTikTokQueueImportStatuses();
assert.strictEqual(rows[0].status,'ready','valid legacy row with tracking, Order ID, products and no warning should be recoverable');
assert.strictEqual(rows[1].status,'needs_review','parser warnings must not be discarded');
assert.strictEqual(rows[2].status,'needs_review','row with no parsed product must remain review-only');
assert.strictEqual(rows[3].status,'daily_import','linked order must not be rewritten');
assert(saved>0);

// A multi-product row with the same Order ID must be carried as context on each product mapping.
const uniqueFn=section('function tiktokUniqueProducts(){','function tiktokProductLooksLikeBundle(product){');
const parent={trackingNo:'VNGH80293690511',orderId:'586670402637104154',status:'ready',reviewReason:'',sourcePages:[10,11],products:[
 {productName:'Ổi Lê Siêu Trái C9',mapKey:'oi'},
 {productName:'Combo 2 chậu Quỳnh Anh',mapKey:'qa'},
 {productName:'Nguyệt quế thái siêu hoa thơm',mapKey:'nq'}
]};
const mapCtx={migrateTikTokProductMapKeys:()=>false,normalizeTikTokQueueImportStatuses:()=>false,
 window:{TikTokLabelImport:{keyForProduct:p=>p.mapKey}},D:{dailyShipmentOrders:[{date:'2026-10-19',trackingNo:parent.trackingNo}]},$:(id)=>({value:'2026-10-19'}),dailyShipmentToday:()=> '2026-10-19',
 tiktokLabelQueue:[parent],normalizeTracking:v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase()};
vm.createContext(mapCtx);vm.runInContext(uniqueFn+';this.tiktokUniqueProducts=tiktokUniqueProducts;',mapCtx);
const mappedProducts=mapCtx.tiktokUniqueProducts();
assert.strictEqual(mappedProducts.length,3);
for(const entry of mappedProducts){assert.strictEqual(entry.orderRows[0].orderId,'586670402637104154');assert.strictEqual(entry.orderRows[0].products.length,3)}

// A three-species draft under a non-combo Oi Le label must route to order-scoped editing, not save as a common rule.
const bundleAndRelated=section('function tiktokProductLooksLikeBundle(product){','function tiktokRecognitionSignatureKeys(product){');
const routeFn=section('async function confirmAndLearnTikTokProductRule(key){','function setTikTokProductMapToExpected(key){');
let opened='',learned=0;
const product={productName:'Ổi Lê Siêu Trái C9',rawProductName:'Ổi Lê Siêu Trái C9-C10',sku:'Mặc định',sellerSku:'',qty:1};
const order={trackingNo:'VNGH80293690511',orderId:'586670402637104154',status:'needs_review',pdfParserStatus:'ready',reviewReason:'Qty các dòng sản phẩm cần Admin đối chiếu',products:[product,{productName:'Combo 2 chậu Quỳnh Anh'},{productName:'Nguyệt quế Thái'}]};
const routeCtx={window:{CloudSync:{state:()=>({role:'admin',user:{uid:'admin'}})},TikTokLabelImport:parser},tiktokUniqueProducts:()=>[{key:'oi',product,orderRows:[order]}],tiktokProductMappingLines:()=>[
 {catalogKey:'oi-c9',perUnit:1},{catalogKey:'qa-c9',perUnit:2},{catalogKey:'vang-bac-c7',perUnit:2}],
 tiktokProductLooksLikeBundle:null,tiktokRelatedMultiProductOrders:null,toast:()=>{},openTikTokOrderCompositionEditor:t=>{opened=t},
 normalizeTracking:v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase(),tiktokLiveOrderForLabel:()=>false,saveTikTokLocalState:()=>true,
 tiktokRecognitionSignatureKeys:()=>[],tiktokRecognitionRules:{},tiktokRecognitionRuleDeletes:new Set(),
 tiktokRecognitionSignatureKeys:()=>[], tiktokRecognitionRuleDeletes:new Set(), isLegacyV2RecognitionSignature:()=>false,
 tiktokMappingIsValid:()=>false, tiktokRecognitionRulesCloudError:''};
vm.createContext(routeCtx);vm.runInContext(bundleAndRelated+';this.tiktokProductLooksLikeBundle=tiktokProductLooksLikeBundle;this.tiktokRelatedMultiProductOrders=tiktokRelatedMultiProductOrders;',routeCtx);vm.runInContext(routeFn,routeCtx);
routeCtx.confirmAndLearnTikTokProductRule('oi').then(()=>{
 assert.strictEqual(opened,'VNGH80293690511','must open the merged order instead of learning three plant types as the reusable Oi Le rule');
 const ui=html.slice(html.indexOf('function renderTikTokProductMappings()'),html.indexOf('function addTikTokProductMapLine'));
 assert(ui.includes('🌿 GỘP CÂY RIÊNG ORDER ID'));
 assert(ui.includes('SỬA QUY TẮC CHUNG VỀ 1 LOẠI CÂY'));
 assert(ui.includes('Không thêm Quỳnh Anh/Nguyệt quế vào quy tắc chung của Ổi Lê')); 
 assert(ui.includes('＋ THÊM CÂY THÀNH PHẦN CHO SẢN PHẨM COMBO NÀY'));
 assert(html.includes('recoverableStaging=row.status===\'daily_import\''));
 assert(html.includes('const recoverableReview=row.status===\'needs_review\'&&tiktokCanEditOrderCompositionRow(row);'),'recognized multi-product row flagged for product mapping/Qty review must still expose the order-specific editor');
 assert(html.includes('const canEditComposition=!assigned&&tiktokCanEditOrderCompositionRow(row);'),'queue row should expose the per-Order-ID composition editor even when ordinary product mapping needs review');
 const reviewRelated=routeCtx.tiktokRelatedMultiProductOrders({orderRows:[order]});
 assert.strictEqual(reviewRelated.length,1,'a needs_review multi-product row with valid Order ID and tracking must retain the Admin-only composition editor');
 const hardBlocked={...order,reviewReason:'Mã vận đơn trùng trong cùng PDF'};
 assert.strictEqual(routeCtx.tiktokRelatedMultiProductOrders({orderRows:[hardBlocked]}).length,0,'duplicate tracking stays blocked');
 console.log('ORDER-ID UI CONTEXT + LEGACY QUEUE STATUS REGRESSION PASS');
}).catch(err=>{console.error(err);process.exitCode=1});
