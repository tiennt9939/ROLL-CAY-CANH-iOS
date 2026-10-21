const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const start=html.indexOf('function pruneTikTokProcessedLabelsFromQueue(orders){');
const end=html.indexOf('function tiktokLabelIsSelectable',start);
if(start<0||end<0)throw new Error('TikTok PDF queue compaction helper not found');
const source=html.slice(start,end);
const queue=[];const live=[];
for(let i=0;i<16;i++){
  const trackingNo=`8625732900${String(i).padStart(2,'0')}`;
  queue.push({trackingNo,status:'assigned',packingOrderId:`tiktok_${trackingNo}`,existingOrder:true,products:[{productName:'stale label payload'}]});
  live.push({id:`tiktok_${trackingNo}`,shipmentTrackingNo:trackingNo,status:'pending',assignmentMode:'open_pool',assignedUid:'',employee:'Đơn chung'});
}
for(let i=0;i<4;i++)queue.push({trackingNo:`8625681312${String(i).padStart(2,'0')}`,status:'ready',packingOrderId:'',products:[{productName:'new label'}]});
const context={tiktokLabelQueue:queue,tiktokSelectedTrackingNos:new Set(queue.slice(0,16).map(x=>x.trackingNo)),
  normalizeTracking:x=>String(x||'').replace(/[^a-z0-9]/gi,'').toUpperCase(),
  tiktokLiveOrderForLabel:row=>live.find(o=>o.id===row.packingOrderId||String(o.shipmentTrackingNo)===String(row.trackingNo))||null,
  saveTikTokLocalState:()=>true};
vm.createContext(context);vm.runInContext(source,context);
const result=context.pruneTikTokProcessedLabelsFromQueue();
if(result.removed!==16)throw new Error(`Expected 16 processed labels to be pruned, got ${result.removed}`);
if(result.labels.length!==4||result.labels.some(x=>x.status!=='ready'))throw new Error('Only the four new ready labels should remain in staging');
if(context.tiktokSelectedTrackingNos.size!==0)throw new Error('Stale selected tracking numbers must be cleared after pruning');
console.log('TIKTOK PDF QUEUE COMPACTION PASS: 16 processed labels hidden/pruned; 4 new labels remain selectable');
