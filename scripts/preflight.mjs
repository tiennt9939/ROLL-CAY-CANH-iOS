import fs from 'node:fs';
import path from 'node:path';
const required = [
  'web/index.html',
  'web/tiktok-label-import.js',
  'web/firebase-config.js',
  'web/roll-platform-bridge.js',
  'native/ios/Plugins/RollPlatformPlugin.swift',
  'reference/tools/ios_pdf_coordinate_contract_test.js',
  'capacitor.config.ts',
  'package.json',
  'docs/IOS_NATIVE_SETUP.md',
  '.github/workflows/ios-build.yml',
  'scripts/prepare-ios-platform.mjs',
  'scripts/register-ios-plugin.rb',
  'docs/GITHUB_ACTIONS_IOS.md'
];
const missing = required.filter(p => !fs.existsSync(path.resolve(p)));
if (missing.length) {
  console.error('PREFLIGHT FAIL; missing:', missing.join(', '));
  process.exit(1);
}
const html = fs.readFileSync('web/index.html', 'utf8');
const bridge = fs.readFileSync('web/roll-platform-bridge.js', 'utf8');
const native = fs.readFileSync('native/ios/Plugins/RollPlatformPlugin.swift', 'utf8');
if (!html.includes('ROLL CÂY CẢNH') || !html.includes('roll-platform-bridge.js')) {
  console.error('PREFLIGHT FAIL; iOS display name or bridge script is missing.');
  process.exit(1);
}
if (!bridge.includes("cap.getPlatform() !== 'ios'") || !bridge.includes('Google Drive')) {
  console.error('PREFLIGHT FAIL; iOS-only bridge guard or Drive gate is missing.');
  process.exit(1);
}
if (!native.includes('adminDelegateAssignedUid') || !native.includes('daily_shipment_')) {
  console.error('PREFLIGHT FAIL; employee-delegation queue metadata or durable queue contract is missing.');
  process.exit(1);
}
if (!native.includes('extractVisualPDFTable(from page: PDFPage)') || !native.includes('page.characterBounds(at: index)')) {
  console.error('PREFLIGHT FAIL; coordinate-aware PDF extraction is missing.')
  process.exit(1);
}
console.log('PREFLIGHT PASS: iOS workspace files and safety checks are present.');
const workflow = fs.readFileSync('.github/workflows/ios-build.yml', 'utf8');
if (!workflow.includes('runs-on: macos-15') || !workflow.includes('vn.rollgardencanh.app') || !workflow.includes('signed_ipa')) {
  console.error('PREFLIGHT FAIL; hosted macOS build workflow or approved Bundle ID is missing.');
  process.exit(1);
}
const config = fs.readFileSync('capacitor.config.ts', 'utf8');
if (!config.includes("appId: 'vn.rollgardencanh.app'")) {
  console.error('PREFLIGHT FAIL; approved Bundle ID does not match Capacitor config.');
  process.exit(1);
}
console.log('PASS hosted macOS workflow, approved Bundle ID, and iPad build setup files');
console.log('LIMITATION: This is not an Xcode compile, Apple signing, Google Drive OAuth test, PDF-parity test, or physical-device test.');
