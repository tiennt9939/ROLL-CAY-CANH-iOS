'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bridgeSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'roll-platform-bridge.js'), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  // The iOS adapter must never install an AndroidBridge shim on Android or the ordinary web.
  const androidWindow = { Capacitor: { getPlatform: () => 'android' } };
  vm.runInNewContext(bridgeSource, { window: androidWindow, console, Promise, JSON, String });
  assert.strictEqual(androidWindow.AndroidBridge, undefined, 'Android must keep its real Java AndroidBridge unchanged');

  const calls = [];
  let failOCR = false;
  const nativePlugin = {
    async pickTikTokShippingPdf() { calls.push('pickTikTokShippingPdf'); return { ok: true, pages: [{ page: 1, text: 'test' }] }; },
    async saveFile(args) { calls.push(['saveFile', args.fileName, args.mimeType]); return { ok: true, shared: true, fileName: args.fileName }; },
    async ocrShippingImage(args) { calls.push(['ocrShippingImage', args.dataUrl]); if (failOCR) throw new Error('OCR sample failure'); return { ok: true, text: 'GHN 123456789' }; },
    async scanTikTokShippingBarcode() { calls.push('scanTikTokShippingBarcode'); return { ok: true, value: '123456789', photoDataUrl: 'data:image/jpeg;base64,AA==' }; },
    async connectGoogleDrive() { throw new Error('iOS OAuth chưa cấu hình'); },
    async listDailyShipmentPendingPhotos() { return { photos: [{ path: '/safe/daily_shipment_ABC_1.jpg', trackingNo: 'ABC' }] }; }
  };
  const toastMessages = [];
  const iosWindow = { Capacitor: { getPlatform: () => 'ios', Plugins: { RollPlatform: nativePlugin } }, console, toast: msg => toastMessages.push(String(msg)) };
  vm.runInNewContext(bridgeSource, { window: iosWindow, console, Promise, JSON, String });
  assert.ok(iosWindow.AndroidBridge, 'iOS compatibility bridge must be created');
  assert.strictEqual(JSON.parse(iosWindow.AndroidBridge.getAppVersionInfo()).versionCode, 144);
  assert.strictEqual(iosWindow.AndroidBridge.isDriveConnected(), false, 'Drive must stay disconnected until real OAuth is configured');

  let pdfResult;
  iosWindow.__pdfCallback = payload => { pdfResult = typeof payload === 'string' ? JSON.parse(payload) : payload; };
  iosWindow.AndroidBridge.pickTikTokShippingPdf('__pdfCallback');
  await delay(0);
  assert.strictEqual(pdfResult?.ok, true, 'PDF result should reach the original callback contract');
  assert.strictEqual(pdfResult?.pages?.[0]?.text, 'test');

  let ocrResult;
  iosWindow.__ocrCallback = payload => { ocrResult = payload; };
  iosWindow.AndroidBridge.ocrShippingImage('data:image/jpeg;base64,AA==', '__ocrCallback');
  await delay(0);
  assert.strictEqual(ocrResult, 'GHN 123456789', 'OCR adapter should pass recognized text to original callback');
  failOCR = true;
  iosWindow.AndroidBridge.ocrShippingImage('data:image/jpeg;base64,AA==', '__ocrCallback');
  await delay(0);
  assert.strictEqual(ocrResult, '', 'failed OCR must not reuse stale recognized text');
  assert.ok(toastMessages.some(msg => msg.includes('OCR sample failure')), 'OCR errors should be visible to the user');
  failOCR = false;

  const sharedFile = await iosWindow.RollPlatform.saveFile({ fileName: 'report.csv', base64: 'eA==', mimeType: 'text/csv' });
  assert.strictEqual(sharedFile.shared, true, 'native export should return its real share-sheet completion result');
  assert.ok(calls.some(row => Array.isArray(row) && row[0] === 'saveFile' && row[1] === 'report.csv'));

  let barcodeResult;
  iosWindow.__barcodeCallback = payload => { barcodeResult = typeof payload === 'string' ? JSON.parse(payload) : payload; };
  iosWindow.AndroidBridge.scanTikTokShippingBarcode('__barcodeCallback');
  await delay(0);
  assert.strictEqual(barcodeResult?.value, '123456789');
  assert.ok(String(barcodeResult?.photoDataUrl || '').startsWith('data:image/'), 'barcode scan must carry its package photo');

  let driveResult;
  iosWindow.__driveBridgeResponse = (id, raw) => { driveResult = { id, payload: JSON.parse(raw) }; };
  iosWindow.AndroidBridge.connectGoogleDrive('drive-test-id');
  await delay(0);
  assert.strictEqual(driveResult?.id, 'drive-test-id');
  assert.strictEqual(driveResult?.payload?.ok, false, 'unconfigured Drive OAuth must report failure, never success');

  const queue = await iosWindow.RollPlatformNative.listDailyShipmentPendingPhotos();
  assert.strictEqual(queue.length, 1, 'native queue should return recovered photos asynchronously');
  assert.strictEqual(queue[0].trackingNo, 'ABC');
  assert.ok(calls.includes('pickTikTokShippingPdf'));
  assert.ok(calls.includes('scanTikTokShippingBarcode'));
  console.log('iOS RollPlatform bridge contract PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
