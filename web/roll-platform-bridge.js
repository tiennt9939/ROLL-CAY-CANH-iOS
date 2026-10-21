/*
 * ROLL CÂY CẢNH iOS compatibility layer.
 * This lives only in the separate iOS workspace. Android V26.2.92 source is untouched.
 * Native promise APIs are adapted to the callback contracts used by the existing web core.
 */
(function () {
  'use strict';
  const cap = window.Capacitor;
  if (!cap || typeof cap.getPlatform !== 'function' || cap.getPlatform() !== 'ios') return;
  if (window.AndroidBridge) return;

  let plugin = cap?.Plugins?.RollPlatform || cap?.Plugins?.RollPlatformPlugin;
  if (!plugin && typeof cap.registerPlugin === 'function') {
    try { plugin = cap.registerPlugin('RollPlatform'); } catch (_) { /* legacy global fallback */ }
  }
  if (!plugin) {
    console.error('[ROLL CÂY CẢNH] Capacitor native plugin RollPlatform chưa được đăng ký trong BridgeViewController.');
  }
  window.RollPlatform = plugin || null;

  const parseCallbackName = (name, fallback) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(name || '')) ? String(name) : fallback;
  const callWindow = (name, payload) => {
    const key = parseCallbackName(name, '');
    if (!key || typeof window[key] !== 'function') return;
    try { window[key](payload); } catch (error) { console.error('[ROLL CÂY CẢNH] callback failed', key, error); }
  };
  const asError = error => String(error?.message || error || 'Tác vụ iOS chưa thực hiện được.');
  const rejectResult = error => ({ ok: false, error: asError(error) });
  const notifyFailure = error => { console.error('[ROLL CÂY CẢNH] iOS native action failed', error); if (typeof window.toast === 'function') window.toast(asError(error)); };
  const invokeCallback = (method, args, callbackName, fallback, transformResult) => {
    if (!plugin || typeof plugin[method] !== 'function') {
      callWindow(callbackName, JSON.stringify({ ok: false, error: 'Native iOS chưa đăng ký chức năng ' + method + '.' }));
      return;
    }
    Promise.resolve().then(() => plugin[method](args || {})).then(
      result => callWindow(callbackName, transformResult ? transformResult(result) : (typeof result === 'string' ? result : JSON.stringify(result ?? {}))),
      error => callWindow(callbackName, transformResult ? transformResult(null, error) : JSON.stringify(rejectResult(error)))
    );
  };
  const driveCallback = (callbackId, work) => {
    Promise.resolve().then(work).then(
      result => { if (typeof window.__driveBridgeResponse === 'function') window.__driveBridgeResponse(String(callbackId || ''), JSON.stringify({ ok: true, ...(result || {}) })); },
      error => { if (typeof window.__driveBridgeResponse === 'function') window.__driveBridgeResponse(String(callbackId || ''), JSON.stringify({ ok: false, error: asError(error) })); }
    );
  };

  window.AndroidBridge = {
    // V26.2.92 is the iOS workspace's pinned baseline. Updates are distributed through Apple,
    // never by attempting to install an APK/IPA from a web URL.
    getAppVersionInfo() { return JSON.stringify({ versionName: '26.2.92', versionCode: 144, platform: 'ios' }); },
    // The web core's legacy Android saveFile API is synchronous. iOS exports use the explicit
    // RollPlatform.saveFile Promise path from downloadText() so success is not reported early.
    saveFile(fileName, base64, mimeType) {
      if (!plugin || typeof plugin.saveFile !== 'function') return false;
      Promise.resolve().then(() => plugin.saveFile({ fileName: String(fileName || 'ROLL-CAY-CANH.csv'), base64: String(base64 || ''), mimeType: String(mimeType || 'application/octet-stream') })).catch(notifyFailure);
      return false;
    },
    isDriveConnected() { return false; },
    connectGoogleDrive(callbackId) {
      driveCallback(callbackId, () => plugin.connectGoogleDrive({}));
    },
    uploadDriveImage(dataUrl, fileName, callbackId) {
      driveCallback(callbackId, () => plugin.uploadDriveImage({ dataUrl: String(dataUrl || ''), fileName: String(fileName || '' ) }));
    },
    downloadDriveImage(fileId, callbackId) {
      driveCallback(callbackId, () => plugin.downloadDriveImage({ fileId: String(fileId || '') }));
    },
    prepareDriveUpload(dataUrl, fileName, callbackId) {
      driveCallback(callbackId, () => plugin.prepareDriveUpload({ dataUrl: String(dataUrl || ''), fileName: String(fileName || '') }));
    },
    pickTikTokShippingPdf(callbackName) {
      invokeCallback('pickTikTokShippingPdf', {}, callbackName, '__tiktokPdfImportResult');
    },
    ocrShippingImage(dataUrl, callbackName) {
      invokeCallback('ocrShippingImage', { dataUrl: String(dataUrl || '') }, callbackName, '__shippingOcrResult', (result, error) => {
        if (error) notifyFailure(error);
        return String(result?.text || '');
      });
    },
    scanTikTokShippingBarcode(callbackName) {
      invokeCallback('scanTikTokShippingBarcode', {}, callbackName, '__tiktokBarcodeResult');
    },
    scanDailyShipmentAssignedBatch(expectedOrdersJson, callbackName) {
      if (!plugin || typeof plugin.scanDailyShipmentAssignedBatch !== 'function') {
        callWindow(callbackName, JSON.stringify({ ok: false, error: 'Máy quét phân công iOS chưa được đăng ký.' }));
        return;
      }
      Promise.resolve().then(() => plugin.scanDailyShipmentAssignedBatch({ expectedOrdersJson: String(expectedOrdersJson || '[]') })).catch(error => {
        callWindow(callbackName, JSON.stringify({ ok: false, error: asError(error) }));
      });
    },
    listDailyShipmentPendingPhotos() {
      // Native photo discovery is asynchronous on iOS; the iOS web core uses RollPlatform directly.
      return '[]';
    },
    loadDailyShipmentPhoto(path, callbackName) {
      invokeCallback('loadDailyShipmentPhoto', { path: String(path || '') }, callbackName, '__dailyShipmentRetryPhoto');
    },
    ackDailyShipmentPhoto(path) {
      if (!plugin || typeof plugin.ackDailyShipmentPhoto !== 'function') return false;
      Promise.resolve().then(() => plugin.ackDailyShipmentPhoto({ path: String(path || '') })).catch(error => console.warn('Acknowledge iOS photo failed', error));
      return true;
    },
    exportPdf(jobName) {
      if (!plugin || typeof plugin.exportPdf !== 'function') throw new Error('Xuất PDF iOS chưa được đăng ký.');
      Promise.resolve().then(() => plugin.exportPdf({ jobName: String(jobName || 'ROLL-CAY-CANH') })).then(result => {
        if (typeof window.finishQuotePdfExport === 'function') window.finishQuotePdfExport(result?.shared === true);
      }).catch(error => { if (typeof window.finishQuotePdfExport === 'function') window.finishQuotePdfExport(false); notifyFailure(error); });
    },
    printA4Page(jobName) {
      if (!plugin || typeof plugin.printA4Page !== 'function') throw new Error('In iOS chưa được đăng ký.');
      Promise.resolve().then(() => plugin.printA4Page({ jobName: String(jobName || 'ROLL-CAY-CANH') })).catch(notifyFailure);
    },
    printOrder65x100(jobName) {
      if (!plugin || typeof plugin.printOrder65x100 !== 'function') throw new Error('In nhãn 65×100 mm trên iOS chưa được đăng ký.');
      Promise.resolve().then(() => plugin.printOrder65x100({ jobName: String(jobName || 'ROLL-CAY-CANH-LABEL') })).catch(notifyFailure);
    }
  };

  window.RollPlatformNative = {
    async listDailyShipmentPendingPhotos() {
      if (!plugin || typeof plugin.listDailyShipmentPendingPhotos !== 'function') return [];
      const result = await plugin.listDailyShipmentPendingPhotos({});
      return Array.isArray(result?.photos) ? result.photos : (Array.isArray(result) ? result : []);
    }
  };
  console.info('[ROLL CÂY CẢNH] iOS bridge compatibility loaded; Google Drive OAuth remains gated until the iOS OAuth client is configured.');
})();
