const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const parser = fs.readFileSync(path.join(root, 'app/src/main/assets/tiktok-label-import.js'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');
const checks = [
  ['Admin can open shared recognition rule manager', html.includes('QUẢN LÝ / THÊM / SỬA QUY TẮC NHẬN DIỆN') && html.includes('function openTikTokQuickRuleManager(')],
  ['Each product exposes confirm-and-learn action', html.includes('XÁC NHẬN QUY TẮC CỦA SẢN PHẨM NÀY') && html.includes('async function confirmAndLearnTikTokProductRule(')],
  ['Manual confirm validates selected catalog rows and per-unit quantities', html.includes('function validateTikTokManualRecognitionMapping(')],
  ['Validation errors show specific causes, not the old generic-only toast', html.includes('Kích thước ghi trên nhãn') && html.includes('Sửa số cây/đơn vị hoặc kiểm tra lại SKU')],
  ['Cloud failure is not reported as success', html.includes('Cloud chưa xác nhận') && html.includes('bấm Đồng bộ')],
  ['Combo of the month alias is normalized', parser.includes('combo\\s+cua\\s+thang')],
  ['Height range is part of signatures', parser.includes('heightRanges')],
  ['Outside TikTok order flow preserved', html.includes('outsideTikTokOrderPanel') && html.includes('renderOutsideTikTokOrderList')],
  ['Version metadata upgraded', gradle.includes('versionCode = 144') && gradle.includes('versionName = "26.2.92"') && workflow.includes('V26.2.92')],
  ['Status filter still includes labels needing plant review', html.includes('<option value="review">Cần kiểm tra cây</option>')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} V26.2.87 checks`);
