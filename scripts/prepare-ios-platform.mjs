import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const iosRoot = path.join(root, 'ios', 'App', 'App');
const sourcePlugin = path.join(
  root,
  'native',
  'ios',
  'Plugins',
  'RollPlatformPlugin.swift'
);
const targetPlugin = path.join(iosRoot, 'RollPlatformPlugin.swift');

const bridgeCandidates = [
  path.join(iosRoot, 'ViewController.swift'),
  path.join(iosRoot, 'BridgeViewController.swift')
];

const plistFile = path.join(iosRoot, 'Info.plist');
const bundleId = 'vn.rollgardencanh.app';

function fail(message) {
  console.error(`iOS preparation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(sourcePlugin)) {
  fail(`Missing native plugin: ${sourcePlugin}`);
}

const bridgeFile = bridgeCandidates.find(file =>
  fs.existsSync(file)
);

if (!bridgeFile) {
  const available = fs.existsSync(iosRoot)
    ? fs.readdirSync(iosRoot).join(', ')
    : '(ios/App/App missing)';

  fail(
    `Capacitor generated no ViewController.swift or BridgeViewController.swift in ${iosRoot}. Files: ${available}`
  );
}

if (!fs.existsSync(plistFile)) {
  fail(`Capacitor generated no Info.plist at ${plistFile}`);
}

fs.copyFileSync(sourcePlugin, targetPlugin);

let bridge = fs.readFileSync(bridgeFile, 'utf8');

if (!bridge.includes('import Capacitor')) {
  bridge = bridge.replace(
    /^(import [^\n]+\n)/m,
    '$1import Capacitor\n'
  );
}

if (
  !bridge.includes(
    'registerPluginInstance(RollPlatformPlugin())'
  )
) {
  const marker =
    /override\s+func\s+capacitorDidLoad\s*\(\s*\)\s*\{/;

  if (marker.test(bridge)) {
    bridge = bridge.replace(
      marker,
      match =>
        `${match}\n        bridge?.registerPluginInstance(RollPlatformPlugin())`
    );
  } else {
    const lastBrace = bridge.lastIndexOf('}');

    if (lastBrace < 0) {
      fail(
        `${path.basename(bridgeFile)} has no class closing brace.`
      );
    }

    bridge =
      bridge.slice(0, lastBrace) +
      '\n    override func capacitorDidLoad() {\n' +
      '        bridge?.registerPluginInstance(RollPlatformPlugin())\n' +
      '    }\n' +
      bridge.slice(lastBrace);
  }
}

fs.writeFileSync(bridgeFile, bridge);

let plist = fs.readFileSync(plistFile, 'utf8');

const entries = [
  [
    'NSCameraUsageDescription',
    'ROLL CÂY CẢNH cần camera để quét mã vận đơn và chụp ảnh xác nhận kiện hàng.'
  ],
  [
    'NSPhotoLibraryUsageDescription',
    'ROLL CÂY CẢNH cần truy cập ảnh để chọn ảnh nhãn hoặc ảnh kiện hàng làm bằng chứng đóng gói.'
  ]
];

for (const [key, value] of entries) {
  if (plist.includes(`<key>${key}</key>`)) {
    continue;
  }

  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  const entry =
    `\t<key>${key}</key>\n` +
    `\t<string>${escaped}</string>\n`;

  plist = plist.replace(
    /<\/dict>/,
    `${entry}</dict>`
  );
}

fs.writeFileSync(plistFile, plist);

const pbxproj = path.join(
  root,
  'ios',
  'App',
  'App.xcodeproj',
  'project.pbxproj'
);

if (!fs.existsSync(pbxproj)) {
  fail(`Missing generated Xcode project: ${pbxproj}`);
}

let project = fs.readFileSync(pbxproj, 'utf8');

if (!/TARGETED_DEVICE_FAMILY\s*=\s*"?1,2"?;/.test(project)) {
  project = project.replace(
    /TARGETED_DEVICE_FAMILY\s*=\s*[^;]+;/g,
    'TARGETED_DEVICE_FAMILY = "1,2";'
  );

  if (!/TARGETED_DEVICE_FAMILY\s*=\s*"?1,2"?;/.test(project)) {
    fail(
      'Could not set TARGETED_DEVICE_FAMILY to universal iPhone+iPad (1,2).'
    );
  }

  fs.writeFileSync(pbxproj, project);
}

console.log(
  `iOS platform prepared. Controller: ${path.basename(bridgeFile)}; ` +
  `Bundle ID: ${bundleId}; device family: iPhone+iPad; ` +
  'plugin copied and registered.'
);
