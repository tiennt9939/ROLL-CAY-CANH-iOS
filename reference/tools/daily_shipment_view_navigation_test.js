'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'tools/preflight.py'), 'utf8');

assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'focused-view build version must be current');
assert(html.includes('id="dailyShipmentViewNav"'), 'daily shipment view navigation is missing');
for (const [tab, label] of [
  ['orders', 'Đơn/ngày'],
  ['mapping', 'Đối chiếu cây'],
  ['rules', 'Quy tắc Admin'],
  ['assign', 'Chia việc'],
  ['outside', 'Đơn ngoài'],
]) {
  assert(new RegExp(`data-shipment-tab="${tab}"[^>]*[\\s\\S]{0,240}${label}`).test(html), `navigation tab ${tab} must be visible in source`);
}

const panelStart = html.indexOf('<div id="tiktokPdfImportPanel"');
const panelEnd = html.indexOf('</div>', panelStart);
assert(panelStart >= 0, 'PDF mapping panel must exist; renderer returns immediately if missing');
assert(html.slice(panelStart, panelStart + 1100).includes('id="tiktokPdfImportStatus"'), 'PDF mapping status must be inside the restored panel');
assert(html.slice(panelStart, panelStart + 1100).includes('id="tiktokProductMappingList"'), 'product-to-catalog reconciliation list must be inside the restored panel');
assert(html.slice(panelStart, panelStart + 1100).includes('id="tiktokLabelQueue"'), 'PDF label queue must be inside the restored panel');

const setStart = html.indexOf('function setDailyShipmentView(view,refreshContent=true)');
const setEnd = html.indexOf('\nfunction renderDailyShipmentPanel()', setStart);
assert(setStart >= 0 && setEnd > setStart, 'focused-view controller must exist');
const controller = html.slice(setStart, setEnd);
assert(controller.includes("new Set(['orders','mapping','rules','assign','outside','admin-maintenance'])"), 'all focused views must be supported');
assert(controller.includes("node.dataset.shipmentView!==next"), 'controller must hide all content outside active view');
assert(controller.includes("if(next==='mapping')"), 'mapping view must render map rows on demand');
assert(controller.includes("loadTikTokRecognitionRulesFromCloud(false)"), 'Admin rules must load shared rules from Cloud when entering mapping/rules views');
assert(controller.includes("else if(next==='assign')renderDailyShipmentAssignmentBoard()"), 'assignment board must render on demand');
assert(controller.includes("else if(next==='outside')renderOutsideTikTokOrderPanel()"), 'outside order panel must render on demand');
assert(controller.includes('resetCard.classList.toggle(\'hidden\',!isAdmin)') && controller.includes('cleanupCard.classList.toggle(\'hidden\',!isAdmin)'), 'Admin maintenance cards must re-evaluate visibility on tab taps after login state resolves');
assert(controller.includes('assignPanel.classList.toggle(\'hidden\',!dailyShipmentAssignmentAdminUiAllowed())'), 'assignment panel must re-evaluate Admin UI permission when switching tabs');

assert(html.includes('id="tiktokQuickRulesButton" type="button" class="primary" data-shipment-view="rules"'), 'quick-rule entry point must be inside the Admin rules view and not statically hidden');
assert(html.includes('id="dailyShipmentAdminMaintenanceBack" data-shipment-view="admin-maintenance"'), 'Admin maintenance needs a dedicated subview with a return link');
assert(html.includes("setDailyShipmentView('mapping',false)"), 'successful PDF import must switch to the focused mapping view');
const importStart = html.indexOf('function importParsedLabelsIntoDailyShipments(parsed)');
const importEnd = html.indexOf('\nfunction startDailyShipmentPdfImport()', importStart);
assert(importStart >= 0 && importEnd > importStart, 'daily PDF import function must exist');
assert(!html.slice(importStart, importEnd).includes('scrollIntoView'), 'PDF import must not scroll the user past the top task navigation');
assert(html.includes('#dailyShipmentPanel .shipment-view-off,#dailyShipmentPanel .shipment-view-role-hidden{display:none!important}'), 'focused view visibility rules must exist');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight must require the correct version metadata');
console.log('DAILY SHIPMENT FOCUSED VIEW NAVIGATION TEST PASS');
