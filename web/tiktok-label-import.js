/* Offline TikTok Shop label parser. Stores only order/product identifiers, never recipient address/phone. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TikTokLabelImport=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function compact(value){return String(value??'').replace(/\s+/g,' ').trim()}
  function normalize(value){return String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  function keyForProduct(p){
    const nameSource=p?.rawProductName||p?.productName;
    const raw=[legacyStripProductDescription(nameSource),p?.sku,p?.sellerSku].map(v=>compact(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()).join('|');
    let h=2166136261;
    for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}
    return 'ttp_'+(h>>>0).toString(36);
  }
  function explicitPlantsPerSoldUnitFromText(value){
    const text=compact(value);
    if(!text)return 0;
    // A written gift combo has N paid plants + M free plants.
    const combo=text.match(/\bcombo\s*(?:x\s*)?(\d{1,3})\b/i);
    if(combo){
      const n=Number(combo[1])||0;
      const gift=text.match(/\btặng\s*(\d{1,3})\b/i)||text.match(/\btang\s*(\d{1,3})\b/i);
      const total=n+(gift?(Number(gift[1])||0):0);
      if(total>0&&total<=100)return total;
    }
    const giftBundle=text.match(/\b(\d{1,3})\s*cây\b[\s\S]{0,40}\btặng\s*(\d{1,3})\b/i)||text.match(/\b(\d{1,3})\s*cây\b[\s\S]{0,40}\btang\s*(\d{1,3})\b/i);
    if(giftBundle){const total=(Number(giftBundle[1])||0)+(Number(giftBundle[2])||0);if(total>0&&total<=100)return total;}
    // Also recognizes titles like “Combo của tháng 4 chậu vàng bạc”.
    const plants=text.match(/\b(\d{1,3})\s*(?:cây|chậu)\b/i);
    if(plants){const count=Number(plants[1])||0;if(count>0&&count<=100)return count;}
    return 0;
  }
  function expectedPlantsPerSoldUnit(product){
    // Qty is the number of sold units, not plants inside a unit.
    // TikTok Product Name is the storefront product title; “Combo 2” can be a title
    // even when the actual sold-unit count is encoded by SKU. Prefer explicit SKU,
    // then Seller SKU, and only fall back to Product Name when neither SKU field
    // states a count (including the established “Combo của tháng 4 chậu ...” labels).
    const skuCount=explicitPlantsPerSoldUnitFromText(product?.sku);
    if(skuCount)return skuCount;
    const sellerSkuCount=explicitPlantsPerSoldUnitFromText(product?.sellerSku);
    if(sellerSkuCount)return sellerSkuCount;
    const titleCount=explicitPlantsPerSoldUnitFromText(product?.productName)||explicitPlantsPerSoldUnitFromText(product?.rawProductName);
    if(titleCount)return titleCount;
    return 1;
  }
  function repairWrappedComboGiftProduct(product){
    if(!product||typeof product!=='object')return product;
    const name=compact(product.rawProductName||product.productName),sku=compact(product.sku);
    const combo=name.match(/\bcombo\s*(?:x\s*)?(\d{1,3})\b/i);
    const giftCount=sku.match(/^(\d{1,3})$/);
    // Observed GHN/TikTok PDF layout: the full product-name cell ends with a detached
    // "tặng", while the adjacent SKU cell contains only "1". Rebuild the SKU so the
    // app does not mistake Combo 4 tặng 1 for Combo 4 and block the 5-plant mapping.
    if(!combo||!giftCount||!/(?:\btặng|\btang)\s*$/i.test(name))return product;
    const comboCount=Number(combo[1])||0,gift=Number(giftCount[1])||0;
    if(comboCount<1||gift<1||comboCount+gift>100)return product;
    const repairedName=compact(name.replace(combo[0],' ').replace(/\b(?:tặng|tang)\s*$/i,' '));
    product.rawProductName=repairedName;
    product.productName=stripProductDescription(repairedName)||repairedName;
    product.sku=`Combo ${comboCount} tặng ${gift}`;
    product.mapKey=keyForProduct(product);
    return product;
  }
  function stripProductDescription(value){
    // Normalize only the plant-identity prefix for catalog matching. Preserve numeric
    // height ranges (25-35cm) and explicit sizes, while cutting known SEO/botanical
    // description continuations found in TikTok product labels.
    let text=compact(value);
    const rangePlaceholder='__ROLL_HEIGHT_RANGE__';
    text=text.replace(/(\d)\s*[-–—]\s*(\d)(?=\s*cm\b)/gi,`$1${rangePlaceholder}$2`);
    text=text.split(/\s[-–—]\s|[-–—]/,1)[0].trim();
    const folded=foldVietnamese(text);
    const markers=[
      ' anh sang gian tiep',' anh sang truc tiep',' phu hop moi khong gian',
      ' trang tri phong thuy',' trang tri vuon',' do am cao',' tan xoe dung nuoc',
      ' san nu hoa',' no quanh',' san vuon',' trong nha',' de ban',' de trong',
      ' cham soc de dang',' la lua chon',' mang den',' tao diem nhan',
      ' cay san hoa',' san hoa + cao',' + cao',' ( cay san hoa',' ( cay sanh hoa',
      ' philodendron',' sang gian tiep',' tan xoe',' nuoc loc',' giu am',
      ' phun suong',' vi tri',' tranh gio lua',' ( cay sanh hoa',' cay sanh hoa',' + cao'
    ];
    let cut=-1;
    for(const marker of markers){const i=folded.indexOf(marker);if(i>=0&&(cut<0||i<cut))cut=i;}
    if(cut>0)text=text.slice(0,cut).trim();
    text=text.replace(/[\s(,+-]+$/,'').trim();
    return text.replaceAll(rangePlaceholder,'-');
  }
  function foldVietnamese(value){
    return compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  }
  function sizeTokens(value){
    const raw=foldVietnamese(value).toUpperCase();
    return [...new Set([...raw.matchAll(/\b([CT])\s*(\d{1,2})\b/g)].map(m=>m[1]+m[2]))];
  }
  // Confirmed user rule for Nguyệt quế: height on the TikTok label determines pot size.
  // 15–20 cm => C7; 20–30 cm => C9. Do not apply these height aliases to other plants.
  function nguyetQueHeightSize(product){
    const text=foldVietnamese([product?.productName,product?.sku,product?.sellerSku].map(compact).filter(Boolean).join(' '));
    if(!/nguyet\s+que/.test(text))return '';
    if(/\b15\s*[-–—]\s*20\s*cm\b/.test(text))return 'C7';
    if(/\b20\s*[-–—]\s*30\s*cm\b/.test(text))return 'C9';
    return '';
  }
  function catalogSizeTokens(row){
    const fromSize=sizeTokens(row?.size||'');
    const fromName=sizeTokens(row?.name||'');
    return [...new Set([...fromSize,...fromName])];
  }
  // Exact, user-confirmed exception: only Combo 5 Cẩm tú mai labels that list C6 and C7
  // together may map to the Cẩm tú mai C7 catalog row. Never extend this to other plants,
  // combo counts, or any label that also names C9/C10/C11.
  function isConfirmedCamTuMaiCombo5C6C7(product){
    // The special C6/C7 exception remains narrow, but its unit count follows the same
    // SKU-first source priority as ordinary products. The title identifies the Cẩm tú mai family.
    const title=compact(product?.productName||product?.rawProductName||'');
    const statedCount=Number(expectedPlantsPerSoldUnit(product));
    if(statedCount!==5)return false;
    const tokens=plantNameTokens(title);
    if(!['cam','tu','mai'].every(token=>tokens.includes(token)))return false;
    const sizes=[...new Set([product?.rawProductName,product?.productName,product?.sku,product?.sellerSku].flatMap(value=>sizeTokens(value||'')))];
    return sizes.length===2&&sizes.includes('C6')&&sizes.includes('C7');
  }
  // A single Product Name such as “Ổi Lê C9-C10” can advertise a stock/variant range,
  // while SKU/Seller SKU carry no independent size. Keep it in review automatically. After
  // Admin explicitly chooses one matching catalog size, the saved rule may reuse that decision
  // for the exact same signature. Do not apply this exception to conflicting fields or heights.
  function isAdminResolvableProductNameSizeRange(product){
    const names=[compact(product?.rawProductName||''),compact(product?.productName||'')].filter(Boolean);
    const nonTitleSizes=[product?.sku,product?.sellerSku].flatMap(value=>sizeTokens(value||''));
    if(nonTitleSizes.length)return false;
    const sizes=[...new Set(names.flatMap(value=>sizeTokens(value)))];
    if(sizes.length!==2||sizes.some(size=>!/^C\d{1,2}$/.test(size)))return false;
    if(nguyetQueHeightSize(product))return false;
    return names.some(value=>/\bC\s*\d{1,2}\s*[-–/]\s*C\s*\d{1,2}\b/i.test(value));
  }
  function plantNameTokens(value){
    let s=foldVietnamese(value);
    // Count and container text belongs to the sold unit, not to the catalog plant name.
    s=s.replace(/\bcombo\s+cua\s+thang\b/g,' ')
       .replace(/\bcombo\s*(?:x\s*)?\d{1,3}\b/g,' ')
       .replace(/\b\d{1,3}\s*(?:cay|chau)\b/g,' ')
       .replace(/\b[ct]\s*\d{1,2}\b/gi,' ')
       .replace(/\b(?:cay|chau)\b/g,' ')
       .replace(/[()\[\]{}.,:;|+_]/g,' ')
       .replace(/[^a-z0-9]+/g,' ');
    // Confirmed spelling variant on the supplied label: "Ruby Đỏ" is the same plant
    // as the catalog spelling "Rubi". SEO/marketing text is removed before tokenizing.
    const aliases={ruby:'rubi'};
    return [...new Set(s.split(/\s+/).filter(t=>t&&t!=='mac'&&t!=='dinh').map(t=>aliases[t]||t))];
  }
  function catalogRowNameTokens(row){
    const raw=String(row?.name||'');
    // Catalog rows sometimes duplicate a size in both name and size; size is resolved separately.
    return plantNameTokens(raw);
  }
  // Compatibility helpers copied from the stable V26.2.72 recognition identity rules.
  // Keep these frozen: local product-map keys and Cloud learned-rule keys were created with them.
  // New description trimming may improve recognition, but must not invalidate persisted mappings.
  function legacyStripProductDescription(value){
    let text=compact(value);
    const rangePlaceholder='__ROLL_HEIGHT_RANGE__';
    text=text.replace(/(\d)\s*[-–—]\s*(\d)(?=\s*cm\b)/gi,`$1${rangePlaceholder}$2`);
    text=text.split(/\s[-–—]\s|[-–—]/,1)[0].trim();
    const folded=foldVietnamese(text);
    const markers=[
      ' anh sang gian tiep',' anh sang truc tiep',' phu hop moi khong gian',
      ' trang tri phong thuy',' trang tri vuon',' do am cao',' tan xoe dung nuoc',
      ' no quanh',' san vuon',' trong nha',' de ban',' de trong',
      ' cham soc de dang',' la lua chon',' mang den',' tao diem nhan',
      ' cay san hoa',' san hoa + cao',' + cao',' ( cay san hoa',' ( cay sanh hoa',
      ' philodendron',' sang gian tiep',' tan xoe',' nuoc loc',' giu am',
      ' phun suong',' vi tri',' tranh gio lua',' ( cay sanh hoa',' cay sanh hoa',' + cao'
    ];
    let cut=-1;
    for(const marker of markers){const i=folded.indexOf(marker);if(i>=0&&(cut<0||i<cut))cut=i;}
    if(cut>0)text=text.slice(0,cut).trim();
    text=text.replace(/[\s(,+-]+$/,'').trim();
    return text.replaceAll(rangePlaceholder,'-');
  }
  function legacyPlantNameTokens(value){
    let s=foldVietnamese(value);
    s=s.replace(/\bcombo\s*(?:x\s*)?\d{1,3}\b/g,' ')
       .replace(/\b\d{1,3}\s*(?:cay|chau)\b/g,' ')
       .replace(/\b[ct]\s*\d{1,2}\b/gi,' ')
       .replace(/\b(?:cay|chau)\b/g,' ')
       .replace(/[()\[\]{}.,:;|+_]/g,' ')
       .replace(/[^a-z0-9]+/g,' ');
    const aliases={ruby:'rubi'};
    return [...new Set(s.split(/\s+/).filter(t=>t&&t!=='mac'&&t!=='dinh').map(t=>aliases[t]||t))];
  }
  function legacyExpectedPlantsPerSoldUnit(product){
    // Frozen pre-V26.2.82 precedence, used only to find previously saved signature keys.
    const fields=[product?.sku,product?.sellerSku,product?.productName,product?.rawProductName].map(compact).filter(Boolean);
    const text=fields.join(' '),combo=text.match(/\bcombo\s*(?:x\s*)?(\d{1,3})\b/i);
    if(combo){const n=Number(combo[1])||0,gift=text.match(/\btặng\s*(\d{1,3})\b/i)||text.match(/\btang\s*(\d{1,3})\b/i);const total=n+(gift?(Number(gift[1])||0):0);return total>0&&total<=100?total:1;}
    const giftBundle=text.match(/\b(\d{1,3})\s*cây\b[\s\S]{0,40}\btặng\s*(\d{1,3})\b/i)||text.match(/\b(\d{1,3})\s*cây\b[\s\S]{0,40}\btang\s*(\d{1,3})\b/i);
    if(giftBundle){const total=(Number(giftBundle[1])||0)+(Number(giftBundle[2])||0);if(total>0&&total<=100)return total;}
    const explicit=text.match(/\b(\d{1,3})\s*(?:cây|chậu)\b/i);if(explicit){const n=Number(explicit[1])||0;if(n>0&&n<=100)return n;}return 1;
  }
  function legacySignatureFromName(product, candidateName){
    // Exact V26.2.72 v2 signature builder: the old app built its signature from
    // productName (which could be either pre-trimmed or untrimmed depending on PDF layout).
    const productName=compact(candidateName||'');
    const identityName=productName.replace(/\b(?:cao\s*)?\d{1,3}\s*(?:[-–—]\s*\d{1,3}\s*)?cm\b/gi,' ');
    const identityTokens=[...new Set(legacyPlantNameTokens(legacyStripProductDescription(identityName)).filter(t=>!['c','t','cao','cm'].includes(t)))].sort();
    const heightSize=nguyetQueHeightSize({...product,productName});
    const sizes=[...new Set([... [productName,product?.sku,product?.sellerSku].flatMap(v=>sizeTokens(v||'')),...(heightSize?[heightSize]:[])])].sort();
    const perUnit=Math.max(1,Number(legacyExpectedPlantsPerSoldUnit({...product,productName}))||1);
    if(!identityTokens.length)return '';
    return JSON.stringify({v:2,identityTokens,sizes,perUnit});
  }
  function legacyRecognitionSignatures(product){
    const raw=compact(product?.rawProductName||'');
    const current=compact(product?.productName||'');
    const candidates=[];
    // V26.2.72 parser paths varied: some stored the cleaned label in productName,
    // while coordinate/fallback paths passed the fuller product cell. Probe the plausible
    // legacy forms without changing or deleting any saved v2 rule.
    if(raw)candidates.push(legacyStripProductDescription(raw)||raw);
    if(current)candidates.push(current);
    if(raw)candidates.push(raw);
    // A previously seen wrapped description rendered “nở quanh năm” as “hoa quanh năm”.
    // This alias exists only for lookup of older keys; it does not alter displayed product text.
    if(raw)candidates.push(raw.replace(/\bnở\s+quanh\b/gi,'hoa quanh'));
    const signatures=[];
    for(const name of candidates){
      const sig=legacySignatureFromName(product,name);
      if(sig&&!signatures.includes(sig))signatures.push(sig);
    }
    return signatures;
  }
  function legacyRecognitionSignature(product){
    return legacyRecognitionSignatures(product)[0]||'';
  }
  // Stable signature for Admin-confirmed recognition rules. It ignores case, Vietnamese accents,
  // punctuation, height ranges (15-20cm vs 20-30cm), and marketing text, but preserves plant identity,
  // Combo count and explicit C/T sizes so a C6/C7 rule cannot leak to a C9 label.
  function recognitionSignature(product){
    const productName=compact(product?.productName||'');
    // Height ranges (for example 15-20cm versus 20-30cm) are descriptive, not catalog pot sizes.
    // Remove them before trimming SEO text so the dash inside a range is not mistaken for the marketing separator.
    const identityName=productName.replace(/\b(?:cao\s*)?\d{1,3}\s*(?:[-–—]\s*\d{1,3}\s*)?cm\b/gi,' ');
    const identityTokens=[...new Set(plantNameTokens(stripProductDescription(identityName)).filter(t=>!['c','t','cao','cm'].includes(t)))].sort();
    const allFields=[product?.productName,product?.sku,product?.sellerSku].map(v=>foldVietnamese(v||''));
    const heightRanges=[...new Set(allFields.flatMap(value=>[...value.matchAll(/\b(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*cm\b/g)].map(m=>`${m[1]}-${m[2]}cm`)))].sort();
    const heightSize=nguyetQueHeightSize(product);
    const sizes=[...new Set([... [product?.productName,product?.sku,product?.sellerSku].flatMap(v=>sizeTokens(v||'')),...(heightSize?[heightSize]:[])])].sort();
    const perUnit=Math.max(1,Number(expectedPlantsPerSoldUnit(product))||1);
    if(!identityTokens.length)return '';
    // Keep the v2 signature byte-identical for products without a printed height range.
    // When a range exists, v3 includes it so a learned mapping for 20-30cm can't leak to 15-20cm.
    const signature={v:heightRanges.length?3:2,identityTokens,sizes,perUnit};
    if(heightRanges.length)signature.heightRanges=heightRanges;
    return JSON.stringify(signature);
  }
  function applyRecognitionRule(product,catalog,rules){
    if(!rules||typeof rules!=='object'||Array.isArray(rules))return {matched:false};
    const signature=recognitionSignature(product);
    const rows=(Array.isArray(catalog)?catalog:[]).map((entry,index)=>{
      const p=entry?.p&&typeof entry.p==='object'?entry.p:entry;
      return {p,key:String(entry?._key||entry?.key||p?.catalogId||p?.plantId||p?.id||''),idx:Number.isInteger(Number(entry?.i))?Number(entry.i):(Number.isInteger(Number(entry?._index))?Number(entry._index):index)};
    });
    const explicitSizes=[...new Set([product?.productName,product?.rawProductName,product?.sku,product?.sellerSku].flatMap(v=>sizeTokens(v||'')))];
    const validateLines=(rule,sourceKey,quick=false)=>{
      if(!Array.isArray(rule?.lines)||!rule.lines.length)return {matched:false};
      const lines=[];let total=0;
      for(const saved of rule.lines){
        const catalogKey=String(saved?.catalogKey||'');
        const perUnit=Number(saved?.perUnit);
        if(!catalogKey||!Number.isInteger(perUnit)||perUnit<1||perUnit>100)return {matched:false};
        const matches=rows.filter(r=>r.key===catalogKey&&r.p&&!r.p.deleted);
        if(matches.length!==1)return {matched:false,needsReview:true,reason:'Quy tắc đã lưu trỏ tới dòng danh mục không còn duy nhất; hãy sửa lại quy tắc.'};
        const hit=matches[0];
        lines.push({catalogKey,perUnit,index:hit.idx,name:String(hit.p.name||''),size:String(hit.p.size||'')});
        total+=perUnit;
      }
      if(!Number.isInteger(total)||total<1||total>100)return {matched:false,needsReview:true,reason:'Tổng số cây trong quy tắc không hợp lệ.'};
      const heightSize=nguyetQueHeightSize(product);
      const allExplicitSizes=[...new Set([...explicitSizes,...(heightSize?[heightSize]:[])])];
      const c6c7Exception=isConfirmedCamTuMaiCombo5C6C7(product)&&lines.length===1&&(()=>{
        const row=rows.find(r=>r.key===lines[0].catalogKey);
        const tokens=row?catalogRowNameTokens(row.p):[];
        return !!row&&tokens.includes('cam')&&tokens.includes('tu')&&tokens.includes('mai')&&catalogSizeTokens(row.p).includes('C7');
      })();
      const adminResolvedRange=rule?.adminResolvedSizeConflict===true&&isAdminResolvableProductNameSizeRange(product)&&lines.length===1&&(()=>{
        const row=rows.find(r=>r.key===lines[0].catalogKey);
        return !!row&&catalogSizeTokens(row.p).some(size=>allExplicitSizes.includes(size));
      })();
      const adminResolvedMultiSize=rule?.adminResolvedMultiSize===true&&lines.length>1&&allExplicitSizes.length>1&&lines.every(line=>{
        const row=rows.find(r=>r.key===line.catalogKey);
        return !!row&&catalogSizeTokens(row.p).some(size=>allExplicitSizes.includes(size));
      });
      if(allExplicitSizes.length>1&&!c6c7Exception&&!adminResolvedRange&&!adminResolvedMultiSize){
        return {matched:false,needsReview:true,reason:'Nhãn ghi nhiều kích thước khác nhau; cần Admin xác nhận đúng từng dòng cây/quy cách.'};
      }
      if(allExplicitSizes.length===1){
        const explicit=allExplicitSizes[0];
        const compatible=lines.every(line=>{
          const row=rows.find(r=>r.key===line.catalogKey);
          return row&&catalogSizeTokens(row.p).includes(explicit);
        });
        if(!compatible)return {matched:false,needsReview:true,reason:`Quy tắc không khớp kích thước ${explicit} ghi rõ trên nhãn. Hãy chọn đúng dòng cây/quy cách.`};
      }
      const detected=Math.max(1,Number(expectedPlantsPerSoldUnit(product)||0));
      const skuCount=explicitPlantsPerSoldUnitFromText(product?.sku);
      const sellerSkuCount=explicitPlantsPerSoldUnitFromText(product?.sellerSku);
      const countOverride=rule?.adminCountOverride===true&&String(rule?.overrideReason||'').trim().length>=6;
      if(skuCount>0&&sellerSkuCount>0&&skuCount!==sellerSkuCount){
        return {matched:false,needsReview:true,reason:`SKU ghi ${skuCount} cây/đơn vị nhưng Seller SKU ghi ${sellerSkuCount}. Cần Admin xác minh nguồn số lượng trước khi tự áp dụng quy tắc.`};
      }
      let countTakenFromSku=false;
      if(detected!==total&&!countOverride){
        // SKU is the user's confirmed source of sold-unit quantity. Product Name such as
        // “Combo 2 chậu cẩm tú mai C9” is the storefront product identity; it must not
        // override an explicit “Combo 4” SKU. For a single-plant mapping, safely retain
        // the chosen catalog row and refresh its per-unit count from SKU. Multi-plant rules
        // are not redistributed automatically because the split between plant types is unknown.
        if(lines.length===1&&skuCount>0&&(!sellerSkuCount||sellerSkuCount===skuCount)){
          lines[0].perUnit=skuCount;total=skuCount;countTakenFromSku=true;
        }else{
          return {matched:false,needsReview:true,reason:`Nhãn/SKU đang cho thấy ${detected} cây/đơn vị nhưng Admin ghép ${total}. Chưa tự áp dụng vì chưa có ngoại lệ số lượng đã xác nhận.`};
        }
      }
      const ruleReason=(quick?'Khớp quy tắc nhanh do Admin tạo.':'Đã nhận diện theo quy tắc Admin đã xác nhận trước đó.')+(countTakenFromSku?' Số cây/đơn vị lấy theo SKU rõ ràng; Product Name chỉ dùng nhận diện sản phẩm.':'');
      const overrideReason= countOverride?String(rule.overrideReason||'').trim():'';
      const overrideNote=countOverride?(detected!==total?` Ngoại lệ số cây: nhãn suy ra ${detected} → Admin xác nhận ${total}. Lý do: ${overrideReason}`:` Admin đã xác nhận SKU/Combo có sai lệch. Lý do: ${overrideReason}`):'';
      return {matched:true,learnedRule:true,quickRuleMatched:quick,signature:sourceKey,reason:ruleReason+overrideNote,adminCountOverride:countOverride,overrideReason,adminResolvedMultiSize,perUnit:total,lines};
    };

    // Preserve current, more-specific keys first. Then probe every plausible V26.2.72
    // signature form because the PDF parser had multiple layout paths that produced different
    // productName text from the same label. Never rewrite/delete legacy rules during lookup.
    const exact=signature?rules[signature]:null;
    if(exact&&!exact.quickRule){
      const result=validateLines(exact,signature,false);
      if(result.matched||result.needsReview)return result;
    }
    const legacyKeys=legacyRecognitionSignatures(product).filter(key=>key&&key!==signature&&rules[key]&&!rules[key].quickRule);
    const legacyResults=[];
    for(const legacyKey of legacyKeys){
      const result=validateLines(rules[legacyKey],legacyKey,false);
      if(result.matched||result.needsReview)legacyResults.push(result);
    }
    const legacyGood=legacyResults.filter(result=>result.matched);
    const legacyTargets=new Set(legacyGood.map(result=>JSON.stringify(result.lines.map(line=>({catalogKey:line.catalogKey,perUnit:line.perUnit})))));
    if(legacyResults.some(result=>result.needsReview))return legacyResults.find(result=>result.needsReview);
    if(legacyTargets.size>1)return {matched:false,needsReview:true,reason:'Tìm thấy nhiều quy tắc cũ khác nhau cho nhãn này. Admin cần đối chiếu một lần để tránh ghép nhầm cây.'};
    if(legacyGood.length)return legacyGood[0];

    // Admin-created quick rules are stored in the same existing Cloud config field; no new
    // Firestore collection/schema is needed. An alias must match as a complete phrase after
    // Vietnamese accent/punctuation normalization. Most-specific phrase wins; ties with
    // conflicting mappings are stopped for Admin review rather than guessed.
    const normalizeAlias=value=>foldVietnamese(value).replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    const haystack=' '+normalizeAlias([product?.rawProductName,product?.productName,product?.sku,product?.sellerSku].map(compact).filter(Boolean).join(' '))+' ';
    const haystackTokens=haystack.trim().split(/\s+/).filter(Boolean);
    // Marketing titles often insert harmless words between plant name and size:
    // “Cẩm tú mai C6” vs “Cẩm tú mai thái C6”, or “Combo 2 cẩm tú mai C9” vs
    // “Combo 2 chậu cẩm tú mai siêu hoa C9”. Exact phrase wins; otherwise require an ordered
    // token match with at most two skipped words between tokens. Short aliases stay exact-only.
    const aliasMatches=alias=>{
      if(haystack.includes(' '+alias+' '))return true;
      const tokens=alias.split(/\s+/).filter(Boolean);
      if(tokens.length<4)return false;
      let positions=[];
      for(let i=0;i<haystackTokens.length;i++)if(haystackTokens[i]===tokens[0])positions.push(i);
      for(let t=1;t<tokens.length&&positions.length;t++){
        const next=[];
        for(const pos of positions){
          const end=Math.min(haystackTokens.length,pos+4); // target token and at most two words between
          for(let j=pos+1;j<end;j++)if(haystackTokens[j]===tokens[t])next.push(j);
        }
        positions=[...new Set(next)];
      }
      return positions.length>0;
    };
    const candidates=[];
    for(const [key,rule] of Object.entries(rules)){
      if(!rule||rule.quickRule!==true||rule.enabled===false||!Array.isArray(rule.aliases))continue;
      // Admin's display title often contains the actual catalog phrase even if a short
      // legacy alias is stale (e.g. title “Cẩm tú mai C11”, alias “Cẩm tú mai vip”).
      // Include the title as an additional explicit Admin-authored phrase; size/count guards
      // below still decide whether the rule is safe for this particular PDF row.
      const aliases=[...new Set([...rule.aliases,rule.title].map(normalizeAlias).filter(a=>a.length>=3))];
      const matches=aliases.filter(aliasMatches);
      if(!matches.length)continue;
      candidates.push({key,rule,score:Math.max(...matches.map(a=>a.length))});
    }
    if(!candidates.length)return {matched:false};
    const bestScore=Math.max(...candidates.map(x=>x.score));
    const best=candidates.filter(x=>x.score===bestScore);
    const mappingSig=rule=>JSON.stringify((Array.isArray(rule.lines)?rule.lines:[]).map(x=>[String(x.catalogKey||''),Number(x.perUnit)||0]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    if(new Set(best.map(x=>mappingSig(x.rule))).size>1){
      return {matched:false,needsReview:true,reason:'Có nhiều quy tắc nhanh cùng khớp với độ ưu tiên như nhau nhưng trỏ tới kết quả khác nhau. Hãy đổi từ khóa để phân biệt rõ.'};
    }
    const chosen=best.sort((a,b)=>String(a.key).localeCompare(String(b.key)))[0];
    return validateLines(chosen.rule,chosen.key,true);
  }
  function matchCatalogProduct(product,catalog){
    const rawName=compact(product?.rawProductName||product?.productName||'');
    const displayName=compact(product?.productName||rawName);
    // The dash may introduce SEO copy, but size can appear after it (e.g. "trái nhỏ chậu C9").
    // Keep the original Product Name for size extraction while trimming description only for plant-name tokens.
    const sourceName=stripProductDescription(displayName);
    const fields=[['productName',rawName],['sku',compact(product?.sku||'')],['sellerSku',compact(product?.sellerSku||'')]];
    const sizesByField=fields.map(([field,value])=>({field,sizes:sizeTokens(value)})).filter(x=>x.sizes.length);
    const explicitSizes=[...new Set(sizesByField.flatMap(x=>x.sizes))];
    const heightSize=nguyetQueHeightSize(product);
    const allExplicitSizes=[...new Set([...explicitSizes,...(heightSize?[heightSize]:[])])];
    const sourceTokenSet=new Set(fields.flatMap(([field,value])=>plantNameTokens(field==='productName'?sourceName:value)));
    // Some PDF layouts split the word "thái" across the Product Name and SKU columns.
    // The plant identity plus an explicit height range identifies the Nguyệt quế Thái catalog family.
    if(heightSize&&/nguyet\s+que/.test(foldVietnamese([rawName,product?.sku,product?.sellerSku].join(' '))))sourceTokenSet.add('thai');
    const sourceTokens=[...sourceTokenSet];
    const qtyPerUnit=Math.max(1,Number(expectedPlantsPerSoldUnit(product))||1);
    const rows=(Array.isArray(catalog)?catalog:[]).map((entry,index)=>{
      const p=entry?.p&&typeof entry.p==='object'?entry.p:entry;
      const idx=Number.isInteger(Number(entry?.i))?Number(entry.i):(Number.isInteger(Number(entry?._index))?Number(entry._index):index);
      const key=String(entry?._key||entry?.key||p?.catalogId||p?.plantId||p?.id||'');
      const nameTokens=catalogRowNameTokens(p);
      const allPresent=nameTokens.length>0&&nameTokens.every(t=>sourceTokens.includes(t));
      const overlap=nameTokens.filter(t=>sourceTokens.includes(t)).length;
      return {p,idx,key,nameTokens,allPresent,overlap,sizeTokens:catalogSizeTokens(p),name:String(p?.name||''),size:String(p?.size||'')};
    }).filter(r=>r.p&&!r.p.deleted&&r.nameTokens.length&&r.allPresent);
    const toCandidate=r=>({key:r.key,index:r.idx,name:r.name,size:r.size});
    if(!displayName||!sourceTokens.length)return {matched:false,reason:'Tên sản phẩm chưa đủ để đối chiếu danh mục.',perUnit:qtyPerUnit,candidates:[]};
    if(!rows.length)return {matched:false,reason:'Không tìm thấy cây tương ứng trong danh mục hiện có.',perUnit:qtyPerUnit,candidates:[]};

    // Confirmed business rule: Combo 5 Cẩm tú mai sold under a C6/C7 mixed-size title
    // maps to the existing Cẩm tú mai C7 row. Do not generalize this exception to other plants,
    // combo counts, or labels that also contain C9/C10/C11 evidence.
    const isCamTuMaiCombo5=isConfirmedCamTuMaiCombo5C6C7(product);
    if(isCamTuMaiCombo5){
      const c7=rows.filter(r=>r.nameTokens.includes('cam')&&r.nameTokens.includes('tu')&&r.nameTokens.includes('mai')&&r.sizeTokens.includes('C7'));
      if(c7.length===1){const hit=c7[0];return {matched:true,reason:'Quy tắc đã chốt: Combo 5 Cẩm tú mai ghi C6/C7 ghép vào Cẩm tú mai C7.',perUnit:5,key:hit.key,index:hit.idx,name:hit.name,size:hit.size,sizeSource:'confirmedBusinessRule',candidates:[toCandidate(hit)]};}
      if(c7.length>1)return {matched:false,reason:'Quy tắc Combo 5 Cẩm tú mai C6/C7 yêu cầu C7 nhưng danh mục có nhiều dòng C7 trùng nhau; Admin cần xác nhận.',perUnit:5,candidates:c7.map(toCandidate),needsReview:true};
    }
    // Any explicit disagreement between Product Name, SKU and Seller SKU is a hard stop unless
    // the exact Cẩm tú mai Combo 5 business rule above applies.
    // A multi-size product name (C6,C7) is ambiguous even if only one of those sizes exists locally.
    const heightConflicts=!!heightSize&&explicitSizes.some(size=>size!==heightSize);
    const conflictingFields=sizesByField.filter(x=>x.sizes.length!==1||explicitSizes.some(z=>!x.sizes.includes(z)));
    if(heightConflicts||conflictingFields.length||allExplicitSizes.length>1){
      return {matched:false,reason:'Tên sản phẩm, SKU hoặc Seller SKU nêu nhiều kích thước hoặc mâu thuẫn nhau; Admin cần xác nhận.',perUnit:qtyPerUnit,candidates:rows.map(toCandidate),needsReview:true,sizeEvidence:sizesByField};
    }
    let candidates=rows;
    let sizeSource='';
    const explicitSize=allExplicitSizes[0]||'';
    if(explicitSize){
      candidates=rows.filter(r=>r.sizeTokens.includes(explicitSize));
      sizeSource=sizesByField.find(x=>x.sizes.includes(explicitSize))?.field||(heightSize?'heightRange':'');
      if(!candidates.length){
        return {matched:false,reason:`Nhãn nêu kích thước ${explicitSize} nhưng không có dòng danh mục tương ứng.`,perUnit:qtyPerUnit,candidates:rows.map(toCandidate),needsReview:true};
      }
    }else{
      // User rule: when the label does not state a size, default to C7 only.
      // Never silently substitute another size just because it is the sole catalog row.
      const c7=rows.filter(r=>r.sizeTokens.includes('C7'));
      if(c7.length){candidates=c7;sizeSource='defaultC7';}
      else return {matched:false,reason:'Nhãn không ghi kích thước và danh mục không có dòng C7 để áp dụng mặc định; Admin cần chọn.',perUnit:qtyPerUnit,candidates:rows.map(toCandidate),needsReview:true};
    }
    if(candidates.length!==1){
      return {matched:false,reason:candidates.length?'Tên cây và kích thước khớp nhiều dòng danh mục; cần Admin chọn đúng.':'Không khớp được một dòng danh mục duy nhất.',perUnit:qtyPerUnit,candidates:candidates.map(toCandidate),needsReview:true};
    }
    const hit=candidates[0];
    return {matched:true,reason:sizeSource==='defaultC7'?'Không ghi kích thước: áp dụng mặc định C7 và khớp duy nhất.':'Khớp duy nhất tên cây và kích thước với danh mục hiện có.',perUnit:qtyPerUnit,key:hit.key,index:hit.idx,name:hit.name,size:hit.size,sizeSource,candidates:[toCandidate(hit)]};
  }
  function extractTracking(text){
    const raw=String(text||'').toUpperCase();
    // Accept occasional spaces/hyphens inserted by PDF text extraction, then normalize the result.
    const patterns=[/\b862(?:[ \t-]?\d){9}\b/g,/\b530(?:[ \t-]?\d){9}\b/g,/\bV[ \t-]*N[ \t-]*G[ \t-]*H(?:[ \t-]?[A-Z0-9]){8,26}\b/g,/\bG[ \t-]*H[ \t-]*V[ \t-]*N(?:[ \t-]?[A-Z0-9]){4,26}\b/g];
    const matches=patterns.flatMap(pattern=>raw.match(pattern)||[]);
    return [...new Set(matches.map(normalize).filter(Boolean))];
  }
  function carrierFor(tracking){
    const t=normalize(tracking);
    if(/^VNGH\d{8,12}$/.test(t)||/^GHVN[A-Z0-9]{4,26}$/.test(t))return 'GHN';
    if(/^862\d{9}$/.test(t))return 'J&T Express';
    if(/^530\d{9}$/.test(t))return 'J&T Cargo';
    return '';
  }
  function parseProductRows(lines, headerIndex, totalIndex, options={}){
    const header=String(lines[headerIndex]||'');
    const skuStart=header.indexOf('SKU');
    const sellerStart=header.indexOf('Seller SKU');
    const qtyStart=header.lastIndexOf('Qty');
    if(skuStart<0||sellerStart<=skuStart||qtyStart<=sellerStart)return [];
    const startCandidates=[];
    for(let i=headerIndex+1;i<totalIndex;i++){
      const line=String(lines[i]||'').replace(/\r/g,'');
      if(!line.trim()||/Qty\s*Total\s*:/i.test(line))continue;
      // Do not rely on the Qty header's character offset: PDF exporters sometimes
      // place the value a few columns earlier or omit trailing whitespace entirely.
      const qtyMatch=line.match(/(?:^|\s)(\d{1,3})\s*$/);
      if(qtyMatch){
        const qty=Number(qtyMatch[1]);
        const qtyIndex=qtyMatch.index+qtyMatch[0].lastIndexOf(qtyMatch[1]);
        // A wrapped Product Name or SKU continuation can itself end in a number
        // (e.g. "Combo 4" or "tặng 1"). Do not treat it as a sold Qty unless the
        // number is near the real Qty column. Apply this to other text representations
        // too; otherwise a malformed extraction can invent a second product.
        const alignedFloor=Math.max(sellerStart+1,Math.round(qtyStart*0.68));
        const headerLooksAligned=options.alignedColumns||/\s{3,}/.test(header);
        if(headerLooksAligned&&qtyIndex<alignedFloor)continue;
        const hasEarlierTableText=lines.slice(headerIndex+1,i).some(value=>String(value||'').trim()&&!/Qty\s*Total\s*:/i.test(String(value||'')));
        // Some PDF extractors emit the Qty in its own right-aligned line. It is valid
        // when the product/SKU cells were emitted immediately above it.
        if(Number.isInteger(qty)&&qty>0&&qty<=1000&&(line.slice(0,qtyIndex).trim()||hasEarlierTableText))
          startCandidates.push({index:i,qty,qtyIndex});
      }
    }
    const products=[];
    for(let n=0;n<startCandidates.length;n++){
      // In TikTok labels the Qty is frequently printed on the FIRST baseline of a
      // product, while its name/description wraps onto following baselines. Start each
      // row at its own Qty anchor and let its wrapped lines remain with that product
      // until the next Qty anchor. Previously, lines after Qty=1 were incorrectly
      // prepended to the NEXT product, merging two plant names into one.
      const candidateIndex=startCandidates[n].index;
      // Preserve any lines before the very first Qty anchor for layouts that print Qty
      // on the final wrapped baseline. For subsequent rows, start at that row's own anchor.
      const start=n===0?headerIndex+1:candidateIndex;
      const end=n+1<startCandidates.length?startCandidates[n+1].index:totalIndex;
      const col={name:[],sku:[],seller:[]};
      for(let i=start;i<end;i++){
        const line=String(lines[i]||'').replace(/\r/g,'');
        if(!line.trim()||/Qty\s*Total\s*:/i.test(line))continue;
        const rowEnd=i===candidateIndex?startCandidates[n].qtyIndex:line.length;
        const bounded=line.slice(0,rowEnd);
        const cells=[bounded.slice(0,Math.min(skuStart,bounded.length)),
          bounded.slice(Math.min(skuStart,bounded.length),Math.min(sellerStart,bounded.length)),
          bounded.slice(Math.min(sellerStart,bounded.length))];
        ['name','sku','seller'].forEach((field,j)=>{const cell=compact(cells[j]);if(cell)col[field].push(cell)});
      }
      const rawProductName=compact(col.name.join(' '));
      const cleanProductName=stripProductDescription(rawProductName)||rawProductName;
      let skuValue=compact(col.sku.join(' '));
      let sellerValue=compact(col.seller.join(' '));
      // TikTok's PDF sometimes positions wrapped Seller SKU lines under the SKU x-coordinate.
      // Example from the supplied J&T label: first baseline has SKU `1 Cây`, then the next
      // baselines at the same x-coordinate contain `Thanh` / `Xuân C9`. Keep the first SKU
      // token as SKU and move only the continuation after a unit-like SKU to Seller SKU when
      // it contains an explicit catalog size. Do not move the primary SKU itself.
      const skuParts=(col.sku||[]).map(compact).filter(Boolean);
      if(!sellerValue&&skuParts.length>1&&/^\d+\s*(?:cây|chau|chậu)$/i.test(skuParts[0])){
        const continuation=compact(skuParts.slice(1).join(' '));
        if(/\b[CT]\s*\d{1,2}\b/i.test(continuation)){
          skuValue=skuParts[0];sellerValue=continuation;
        }
      }
      const product={productName:cleanProductName,rawProductName:rawProductName!==cleanProductName?rawProductName:'',sku:skuValue,sellerSku:sellerValue,qty:startCandidates[n].qty};
      if(!product.productName&&!product.sku&&!product.sellerSku)continue;
      product.mapKey=keyForProduct(product);
      products.push(product);
    }
    return products;
  }
  function parsePageText(text,pageNumber,options={}){
    text=String(text??'');
    const tracks=extractTracking(text);
    const orderIds=[...new Set([...text.matchAll(/\bOrder\s*ID\s*:[ \t]*((?:\d[ \t-]*){12,25})/gi)].map(m=>normalize(m[1])).filter(x=>/^\d{12,25}$/.test(x)))];
    const lines=text.split(/\r?\n/);
    let headerIndex=lines.findIndex(line=>/Product\s*Name/i.test(line)&&/Seller\s*SKU/i.test(line)&&/Qty/i.test(line));
    let totalIndex=lines.findIndex((line,i)=>i>(headerIndex<0?-1:headerIndex)&&/Qty\s*Total\s*:/i.test(line));
    const footerOrderIndex=headerIndex>=0?lines.findIndex((line,i)=>i>headerIndex&&/^\s*Order\s*ID\s*:/i.test(line)):-1;
    const qtyTotalMatch=text.match(/Qty\s*Total\s*:\s*(\d{1,4})/i);
    const qtyTotal=qtyTotalMatch?Number(qtyTotalMatch[1]):0;
    // Some TikTok pages put the product rows on page N and print Qty Total only on page N+1.
    // The first footer Order ID after the table header is the end of the table on page N;
    // without this boundary the final product absorbs the footer Order ID as Seller SKU.
    if(totalIndex<0)totalIndex=lines.length;
    const tableEndIndex=footerOrderIndex>=0?Math.min(totalIndex,footerOrderIndex):totalIndex;
    let products=headerIndex>=0?parseProductRows(lines,headerIndex,tableEndIndex,options):[];
    // Fallback for the standard PDFTextStripper mode, which may emit table
    // columns as separate blocks. Read only each label/value block until its blank separator.
    if(!products.length){
      const findLabel=(label,from=0)=>lines.findIndex((v,i)=>i>=from&&new RegExp('^\\s*'+label+'\\s*$','i').test(String(v||'')));
      const blockAfter=index=>{
        if(index<0)return [];
        const values=[];
        for(let i=index+1;i<lines.length;i++){
          const value=String(lines[i]||'').trim();
          if(!value) break
          values.push(value);
        }
        return values;
      };
      const productHeader=findLabel('Product Name');
      const skuHeader=findLabel('SKU',Math.max(0,productHeader+1));
      const sellerHeader=findLabel('Seller SKU',Math.max(0,skuHeader+1));
      const qtyHeader=findLabel('Qty',Math.max(0,sellerHeader+1));
      const totalLine=lines.findIndex((v,i)=>i>Math.max(qtyHeader,sellerHeader)&&/^\s*Qty\s*Total\s*:/i.test(String(v||'')));
      if(productHeader>=0&&skuHeader>productHeader&&sellerHeader>skuHeader&&qtyHeader>sellerHeader&&totalLine>qtyHeader){
        const rawName=compact(blockAfter(productHeader).join(' '));
        const name=stripProductDescription(rawName)||rawName;
        const sku=compact(blockAfter(skuHeader).join(' '));
        const sellerSku=compact(blockAfter(sellerHeader).join(' '));
        const qtyValues=blockAfter(qtyHeader).filter(v=>/^\d{1,3}$/.test(v)).map(Number).filter(v=>v>0&&v<=1000);
        if(name&&qtyValues.length){const product={productName:name,rawProductName:rawName!==name?rawName:'',sku,sellerSku,qty:qtyValues[0]};product.mapKey=keyForProduct(product);products.push(product)}
      }
    }
    // Layout-independent fallback for a product row where the quantity column shifts left.
    if(!products.length&&headerIndex>=0){
      const header=String(lines[headerIndex]||'');
      const skuStart=header.indexOf('SKU'),sellerStart=header.indexOf('Seller SKU');
      const fallback=[];
      if(skuStart>=0&&sellerStart>skuStart){
        for(let i=headerIndex+1;i<totalIndex;i++){
          const line=String(lines[i]||'');const m=line.match(/(?:^|\s)(\d{1,3})\s*$/);if(!m)continue;
          const qty=Number(m[1]),end=m.index+m[0].lastIndexOf(m[1]);if(!Number.isInteger(qty)||qty<1||qty>1000)continue;
          const alignedFloor=Math.max(sellerStart+1,Math.round(header.lastIndexOf('Qty')*0.68));
          if((options.alignedColumns||/\s{3,}/.test(header))&&end<alignedFloor)continue;
          const before=line.slice(0,end).trim();if(!before)continue;
          const rawProductName=compact(before.slice(0,Math.min(skuStart,before.length)));
          const productName=stripProductDescription(rawProductName)||rawProductName;
          const product={productName,rawProductName:rawProductName!==productName?rawProductName:'',sku:compact(before.slice(Math.min(skuStart,before.length),Math.min(sellerStart,before.length))),sellerSku:compact(before.slice(Math.min(sellerStart,before.length))),qty};
          if(product.productName||product.sku||product.sellerSku){product.mapKey=keyForProduct(product);fallback.push(product)}
        }
      }
      products=fallback;
    }
    // Repair wrapped Combo N tặng M regardless of which PDF text representation won.
    products.forEach(repairWrappedComboGiftProduct);
    const reasons=[];
    if(tracks.length!==1)reasons.push(tracks.length?'Có nhiều mã vận đơn khác nhau trên một trang':'Không đọc được mã vận đơn hợp lệ');
    if(orderIds.length!==1)reasons.push(orderIds.length?'Có nhiều Order ID khác nhau trên một trang':'Không đọc được Order ID');
    if(!products.length)reasons.push('Không tách được dòng sản phẩm/SKU/Qty');
    // Qty Total belongs to the entire Order ID, not necessarily this page. Do not replace
    // a page's single Qty with Qty Total here: a continuation page may contain one real
    // product row (Qty 1) while the order-wide footer says Qty Total 3. Keep each row's own
    // Qty and defer reconciliation until parsePages() has grouped all pages by Order ID.
    if(qtyTotal>0&&products.length){
      const parsedQty=products.reduce((sum,p)=>sum+Math.max(0,Number(p.qty)||0),0);
      if(parsedQty!==qtyTotal){
        reasons.push(`Qty trang này (${parsedQty}) khác Qty Total của đơn (${qtyTotal}); sẽ đối chiếu sau khi ghép các trang cùng Order ID.`);
      }
    }
    return {page:Number(pageNumber||0)||0,trackingNo:tracks.length===1?tracks[0]:'',carrier:tracks.length===1?carrierFor(tracks[0]):'',orderId:orderIds.length===1?orderIds[0]:'',products,qtyTotal,status:reasons.length?'needs_review':'ready',reviewReason:reasons.join('; ')};
  }
  function parsePage(page){
    if(!page||typeof page!=='object')return parsePageText(page,page?.page||page?.pageNumber||0);
    const pageNo=page.page||page.pageNumber||0;
    // Android PDFBox can return: (1) a layout-preserving stream, (2) standard stream order,
    // and (3) a visual-coordinate reconstruction. Test all available representations and
    // choose the one with the strongest product evidence instead of trusting the first text.
    const representations=[
      {value:page.visualText,alignedColumns:true},
      {value:page.text,alignedColumns:false},
      {value:page.fallbackText,alignedColumns:false}
    ].filter((item,index,all)=>typeof item.value==='string'&&item.value.trim()&&all.findIndex(other=>other.value===item.value)===index);
    const candidates=representations.map(item=>parsePageText(item.value,pageNo,{alignedColumns:item.alignedColumns}));
    if(!candidates.length)return parsePageText('',pageNo);
    const score=row=>{
      const products=Array.isArray(row.products)?row.products:[];
      // Prefer complete table rows over a malformed extraction that treats a wrapped
      // description/SKU fragment as another product. A legitimate multi-product order
      // still scores well when each row carries a SKU/Seller SKU and Qty.
      const evidence=products.reduce((sum,p)=>{
        const hasSku=!!compact(p.sku),hasSeller=!!compact(p.sellerSku);
        return sum+(p.productName?3:0)+(hasSku?8:0)+(hasSeller?5:0)+(Number(p.qty)>0?5:0)+(!hasSku&&!hasSeller?-5:0);
      },0);
      const quantitySum=products.reduce((sum,p)=>sum+Math.max(0,Number(p.qty)||0),0);
      const qtyConsistency=row.qtyTotal>0?(quantitySum===row.qtyTotal?90:-(120+Math.min(800,Math.abs(quantitySum-row.qtyTotal)*100))):0;
      return (row.status==='ready'?1000:0)+evidence+qtyConsistency+(row.trackingNo?3:0)+(row.orderId?2:0);
    };
    let best=candidates[0];
    for(let i=1;i<candidates.length;i++)if(score(candidates[i])>score(best))best=candidates[i];
    // Preferred Android path: use table cells reconstructed from actual PDF glyph X coordinates.
    // Do not slice proportional-font text by character offsets; that is what merged a previous
    // combo's SKU/description into the next product and made one product map to two plant types.
    if(Array.isArray(page.tableRows)){
      const structuredProducts=[];
      for(const source of page.tableRows){
        if(!source||typeof source!=='object')continue;
        const rawName=compact(source.productName||'');
        let sku=compact(source.sku||''),sellerSku=compact(source.sellerSku||'');
        // Some TikTok labels wrap Seller SKU beneath the SKU column. Keep the sold-unit SKU
        // (e.g. "1 Cây") and move only the trailing identity/size continuation to Seller SKU.
        const wrappedSku=sku.match(/^(\d+\s*(?:cây|chau|chậu))\s+(.+)$/i);
        if(wrappedSku&&sizeTokens(wrappedSku[2]).length&&(!sellerSku||!sizeTokens(sellerSku).length)){
          sku=compact(wrappedSku[1]);
          sellerSku=compact([wrappedSku[2],sellerSku].filter(Boolean).join(' '));
        }
        const productName=stripProductDescription(rawName)||rawName;
        const qty=Number(source.qty)||0;
        if(!rawName||!Number.isInteger(qty)||qty<1||qty>1000)continue;
        const product={productName,rawProductName:productName!==rawName?rawName:'',sku,sellerSku,qty};
        repairWrappedComboGiftProduct(product);
        product.mapKey=keyForProduct(product);
        structuredProducts.push(product);
      }
      // Android always supplies tableRows as an array, even when coordinate-cell
      // reconstruction fails on a continuation page. An empty array is NOT evidence
      // that the page has no products: retain a valid row parsed from visualText/text.
      // This is essential when page N+1 has the same Order ID and a real product row
      // but no tracking barcode (e.g. the Ổi Lê line on pages 10–11).
      if(structuredProducts.length){
        best.products=structuredProducts;
        if(best.trackingNo&&best.orderId){best.status='ready';best.reviewReason='';}
        else{best.status='needs_review';best.reviewReason=[!best.trackingNo?'Không đọc được mã vận đơn hợp lệ':'',!best.orderId?'Không đọc được Order ID':''].filter(Boolean).join('; ');}
      }else if(!Array.isArray(best.products)||!best.products.length){
        // Neither structured cells nor text representations yielded a product row.
        best.products=[];
        best.status='needs_review';
        best.reviewReason=[!best.trackingNo?'Không đọc được mã vận đơn hợp lệ':'',!best.orderId?'Không đọc được Order ID':'','Không tách được dòng sản phẩm/SKU/Qty'].filter(Boolean).join('; ');
      }
    }
    // Keep qtyTotal until parsePages() has classified continuation pages. It is removed
    // only after grouping, so a footer-only page cannot be mistaken for a second shipment.
    const hasTracking=!!best.trackingNo;
    // A page without tracking is a footer-only continuation ONLY when no genuine product row
    // was parsed. TikTok can split a single order across pages and put another complete product
    // row on the next page (for example Quỳnh Anh + Nguyệt quế on one page, Ổi Lê on the next).
    // Do not discard those products merely because the continuation page lacks a barcode.
    best.continuationOnly=!hasTracking&&!!best.orderId&&Number(best.qtyTotal)>0&&!(Array.isArray(best.products)&&best.products.length>0);
    if(best.continuationOnly) { best.products=[]; best.status='continuation'; best.reviewReason='Trang tiếp nối chỉ có Qty Total/Order ID'; }
    return best;
  }
  function parsePages(pages){
    const parsed=(Array.isArray(pages)?pages:[]).map(parsePage);
    // A TikTok label may span two PDF pages: page one contains the barcode/product rows,
    // while the next page contains only Qty Total/footer and repeats the same Order ID.
    // Merge continuation pages by exact Order ID (or exact tracking when Order ID is absent)
    // before creating daily-shipment rows, so one physical order cannot become two orders.
    const rows=[],byOrder=new Map(),byTracking=new Map();
    const productSig=p=>[normalize(p?.rawProductName||p?.productName),normalize(p?.sku),normalize(p?.sellerSku),String(Number(p?.qty)||0)].join('|');
    for(const incoming of parsed){
      const orderId=String(incoming.orderId||'').trim();
      const tracking=normalize(incoming.trackingNo||'');
      // Exact Order ID is authoritative. Never let a tracking-number lookup override an
      // already found Order ID group: the visual PDF extractor can sometimes pick up a
      // side/barcode string from a continuation page. Keep that tracking as an alias for
      // audit, but do not split one order into two rows merely because tracking differs.
      const priorByOrder=(orderId&&byOrder.get(orderId))||null;
      const trackingPrior=(tracking&&byTracking.get(tracking))||null;
      const prior=priorByOrder||trackingPrior||null;
      const priorTracking=normalize(prior?.trackingNo||'');
      const conflictingTracking=!!(prior&&tracking&&priorTracking&&priorTracking!==tracking);
      const conflictingOrder=!!(prior&&orderId&&prior.orderId&&String(prior.orderId)!==orderId);
      const sameKnownOrder=!!(prior&&orderId&&prior.orderId&&String(prior.orderId)===orderId);
      const sameKnownTracking=!!(prior&&tracking&&priorTracking&&priorTracking===tracking);
      const continuationCanMerge=!!(incoming.continuationOnly&&sameKnownOrder&&!conflictingOrder);
      const priorSigs=(prior?.products||[]).map(productSig).sort();
      const incomingSigs=(incoming.products||[]).map(productSig).sort();
      const identicalProductPages=priorSigs.length>0&&priorSigs.length===incomingSigs.length&&priorSigs.every((sig,i)=>sig===incomingSigs[i]);
      // If both pages repeat the same tracking number and exactly the same nonempty product
      // rows, treat them as duplicate full labels (keep the duplicate safety flag). Otherwise,
      // merge any exact Order ID match even if the tracking extraction differs. Tracking-only
      // fallback still requires exact tracking and no Order ID conflict.
      const duplicateFullLabel=!!(identicalProductPages&&priorTracking&&tracking&&priorTracking===tracking);
      const sameShipmentPages=!!(prior&&(sameKnownOrder||sameKnownTracking)&&!conflictingOrder&&!duplicateFullLabel&&(sameKnownOrder||!conflictingTracking));
      if(prior&&!conflictingOrder&&!duplicateFullLabel&&(continuationCanMerge||sameShipmentPages)){
        // Group every page by exact Order ID first. Tracking is only a fallback key when the
        // Order ID is absent; a footer-only page remains empty even if a fallback parser sees Qty Total.
        // For pages with actual product rows, preserve legitimate repeated product lines.
        const incomingProducts=incoming.continuationOnly?[]:(incoming.products||[]);
        const seen=new Set((prior.products||[]).map(productSig));
        for(const product of incomingProducts){
          const sig=productSig(product);
          // Only suppress exact repeats when a page is a continuation/overlap; distinct product
          // lines on a real product page remain in the same order.
          if(!seen.has(sig)){prior.products.push(product);seen.add(sig)}
        }
        if(!prior.trackingNo&&incoming.trackingNo)prior.trackingNo=incoming.trackingNo;
        if(!prior.carrier&&incoming.carrier)prior.carrier=incoming.carrier;
        if(!prior.orderId&&incoming.orderId)prior.orderId=incoming.orderId;
        const primaryTracking=normalize(prior.trackingNo||'');
        const allTrackings=[...(Array.isArray(prior.trackingAliases)?prior.trackingAliases:[]),priorTracking,tracking].map(normalize).filter(Boolean);
        prior.trackingAliases=[...new Set(allTrackings)].filter(value=>value!==primaryTracking);
        prior.page=prior.page||incoming.page;
        prior.sourcePages=[...new Set([...(prior.sourcePages||[prior.page]),incoming.page])];
        const totalProducts=(prior.products||[]).reduce((n,p)=>n+Math.max(0,Number(p.qty)||0),0);
        const mergedQtyTotal=Math.max(Number(prior.qtyTotal)||0,Number(incoming.qtyTotal)||0);
        if(prior.trackingNo&&prior.orderId&&prior.products.length&&(!mergedQtyTotal||totalProducts===mergedQtyTotal)){
          prior.status='ready';
          prior.reviewReason='';
        }else{
          prior.status='needs_review';
          const mismatch=mergedQtyTotal&&totalProducts!==mergedQtyTotal?`Qty từng sản phẩm (${totalProducts}) không khớp Qty Total (${mergedQtyTotal}); cần kiểm tra PDF, chưa cho phép ghi nhận.`:'';
          prior.reviewReason=[prior.reviewReason,incoming.reviewReason,mismatch].filter(Boolean).join('; ');
        }
        prior.qtyTotal=mergedQtyTotal;
        if(prior.orderId&&!byOrder.has(String(prior.orderId)))byOrder.set(String(prior.orderId),prior);
        const priorTrackingKey=normalize(prior.trackingNo||'');
        if(priorTrackingKey&&!byTracking.has(priorTrackingKey))byTracking.set(priorTrackingKey,prior);
        if(tracking&&!byTracking.has(tracking))byTracking.set(tracking,prior);
      }else{
        const row={...incoming,products:[...(incoming.products||[])],sourcePages:[incoming.page]};
        rows.push(row);
        if(orderId&&!byOrder.has(orderId))byOrder.set(orderId,row);
        if(tracking&&!byTracking.has(tracking))byTracking.set(tracking,row);
      }
    }
    // Final Qty Total reconciliation happens only AFTER Order ID grouping. A single-row,
    // single-page order can recover a misread Qty from its authoritative Qty Total. If the
    // order spans pages or contains multiple product lines, never push the total onto one row.
    rows.forEach(row=>{
      const qtyTotal=Math.max(0,Number(row.qtyTotal)||0);
      const productQty=(row.products||[]).reduce((sum,p)=>sum+Math.max(0,Number(p.qty)||0),0);
      if(qtyTotal>0&&productQty!==qtyTotal){
        if((row.products||[]).length===1&&(row.sourcePages||[]).length===1&&row.trackingNo&&row.orderId&&Number.isInteger(qtyTotal)&&qtyTotal<=1000){
          row.products[0].qty=qtyTotal;
          row.products[0].mapKey=keyForProduct(row.products[0]);
          row.status='ready';
          row.reviewReason='';
        }else{
          row.status='needs_review';
          row.reviewReason=[row.reviewReason,`Qty các dòng sản phẩm (${productQty}) không khớp Qty Total của đơn (${qtyTotal}); cần kiểm tra PDF, chưa cho phép ghi nhận.`].filter(Boolean).join('; ');
        }
      }
    });
    const seenTracking=new Map();
    rows.forEach(row=>{if(!row.trackingNo)return;const key=normalize(row.trackingNo);seenTracking.set(key,(seenTracking.get(key)||0)+1)});
    rows.forEach(row=>{if(row.trackingNo&&(seenTracking.get(normalize(row.trackingNo))||0)>1){row.status='needs_review';row.reviewReason=[row.reviewReason,'Mã vận đơn trùng trong cùng PDF'].filter(Boolean).join('; ')}});
    rows.forEach(row=>{delete row.qtyTotal;delete row.continuationOnly;});
    return rows;
  }
  return {compact,normalize,keyForProduct,explicitPlantsPerSoldUnitFromText,expectedPlantsPerSoldUnit,legacyExpectedPlantsPerSoldUnit,stripProductDescription,legacyStripProductDescription,foldVietnamese,sizeTokens,nguyetQueHeightSize,plantNameTokens,isConfirmedCamTuMaiCombo5C6C7,isAdminResolvableProductNameSizeRange,recognitionSignature,legacyRecognitionSignature,legacyRecognitionSignatures,applyRecognitionRule,matchCatalogProduct,extractTracking,carrierFor,parseProductRows,parsePage,parsePages};
});
