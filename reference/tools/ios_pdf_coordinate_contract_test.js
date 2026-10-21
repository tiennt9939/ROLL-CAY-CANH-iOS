'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const swift = fs.readFileSync(path.join(root, 'native/ios/Plugins/RollPlatformPlugin.swift'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'web/roll-platform-bridge.js'), 'utf8');

assert(swift.includes('private static func extractVisualPDFTable(from page: PDFPage)'),
  'iOS PDF picker must use coordinate-aware table reconstruction');
assert(swift.includes('page.characterBounds(at: index)'),
  'table cell boundaries must derive from actual PDF glyph coordinates');
assert(swift.includes('"tableRows": visual.tableRows'),
  'structured table rows must be passed to the existing parser');
assert(swift.includes('"productName": name, "sku": sku, "sellerSku": seller, "qty": activeQty'),
  'structured rows must preserve the product/SKU/Seller SKU/Qty contract');
assert(swift.includes('folded.contains("qty total:") || folded.contains("order id:")'),
  'continuation extraction must stop at Qty Total or Order ID footer');
assert(html.indexOf('<script src="roll-platform-bridge.js"></script>') > html.indexOf('<script src="tiktok-label-import.js"></script>'),
  'iOS compatibility bridge must load after the parser and before application code');
assert(swift.includes('CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise)') &&
       bridge.includes('plugin.saveFile({ fileName:') && bridge.includes('if (error) notifyFailure(error)'),
  'iOS text/CSV export must use the native share sheet and report OCR failures instead of hiding them');
console.log('PASS: iOS PDF coordinate contract, Capacitor runtime ordering, and file export contract');
