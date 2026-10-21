import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const iosProjectRoot = path.join(root, 'ios', 'App');
const iosAppRoot = path.join(iosProjectRoot, 'App');

const sourcePlugin = path.join(
  root,
  'native',
  'ios',
  'Plugins',
  'RollPlatformPlugin.swift'
);

// Khớp với project.main_group trong script Ruby hiện có.
const targetPlugin = path.join(
  iosProjectRoot,
  'RollPlatformPlugin.swift'
);

const appDelegateFile = path.join(
  iosAppRoot,
  'AppDelegate.swift'
);

const storyboardFile = path.join(
  iosAppRoot,
  'Base.lproj',
  'Main.storyboard'
);

const plistFile = path.join(
  iosAppRoot,
  'Info.plist'
);

const pbxproj = path.join(
  iosProjectRoot,
  'App.xcodeproj',
  'project.pbxproj'
);

const bundleId = 'vn.rollgardencanh.app';
const customControllerName = 'RollGardenBridgeViewController';

function fail(message) {
  console.error(`iOS preparation failed: ${message}`);
  process.exit(1);
}

function requireFile(file, label) {
  if (!fs.existsSync(file)) {
    fail(`Missing ${label}: ${file}`);
  }
}

requireFile(sourcePlugin, 'native plugin source');
requireFile(appDelegateFile, 'generated AppDelegate.swift');
requireFile(storyboardFile, 'Main.storyboard');
requireFile(plistFile, 'generated Info.plist');
requireFile(pbxproj, 'generated Xcode project');

// Đặt plugin tại ios/App để khớp đường dẫn file reference
// mà scripts/register-ios-plugin.rb hiện đang tạo.
fs.copyFileSync(sourcePlugin, targetPlugin);

// Tạo controller tùy chỉnh ngay trong AppDelegate.swift.
// Tệp này đã thuộc App target nên không cần thêm file controller
// riêng vào Xcode project.
let appDelegate = fs.readFileSync(
  appDelegateFile,
  'utf8'
);

if (!appDelegate.includes('import Capacitor')) {
  if (/^import [^\n]+/m.test(appDelegate)) {
    appDelegate = appDelegate.replace(
      /^(import [^\n]+\n)/m,
      '$1import Capacitor\n'
    );
  } else {
    appDelegate =
      'import UIKit\nimport Capacitor\n\n' +
      appDelegate;
  }
}

if (
  !appDelegate.includes(
    `class ${customControllerName}: CAPBridgeViewController`
  )
) {
  appDelegate +=
    `\n\nfinal class ${customControllerName}: CAPBridgeViewController {\n` +
    '    override func capacitorDidLoad() {\n' +
    '        super.capacitorDidLoad()\n' +
    '        bridge?.registerPluginInstance(RollPlatformPlugin())\n' +
    '    }\n' +
    '}\n';
}

fs.writeFileSync(
  appDelegateFile,
  appDelegate,
  'utf8'
);

// Đổi storyboard từ controller mặc định của Capacitor
// sang controller tùy chỉnh trong module App.
let storyboard = fs.readFileSync(
  storyboardFile,
  'utf8'
);

let matchedBridgeControllers = 0;

storyboard = storyboard.replace(
  /<viewController\b[^>]*>/g,
  tag => {
    const isDefault = tag.includes(
      'customClass="CAPBridgeViewController"'
    );

    const isCustom = tag.includes(
      `customClass="${customControllerName}"`
    );

    if (!isDefault && !isCustom) {
      return tag;
    }

    matchedBridgeControllers += 1;

    let updated = tag.replace(
      'customClass="CAPBridgeViewController"',
      `customClass="${customControllerName}"`
    );

    if (/customModule="[^"]*"/.test(updated)) {
      updated = updated.replace(
        /customModule="[^"]*"/,
        'customModule="App"'
      );
    } else {
      updated = updated.replace(
        `customClass="${customControllerName}"`,
        `customClass="${customControllerName}" customModule="App"`
      );
    }

    if (!updated.includes('customModuleProvider=')) {
      updated = updated.replace(
        'customModule="App"',
        'customModule="App" customModuleProvider="target"'
      );
    }

    return updated;
  }
);

if (matchedBridgeControllers !== 1) {
  fail(
    'Expected exactly one Capacitor bridge view controller ' +
    `in Main.storyboard, found ${matchedBridgeControllers}.`
  );
}

if (
  !storyboard.includes(
    `customClass="${customControllerName}"`
  ) ||
  !storyboard.includes('customModule="App"')
) {
  fail(
    'Main.storyboard does not point to the custom bridge controller.'
  );
}

fs.writeFileSync(
  storyboardFile,
  storyboard,
  'utf8'
);

// Bổ sung mô tả quyền camera và thư viện ảnh,
// không chèn trùng nếu đã tồn tại.
let plist = fs.readFileSync(
  plistFile,
  'utf8'
);

const privacyEntries = [
  [
    'NSCameraUsageDescription',
    'ROLL CÂY CẢNH cần camera để quét mã vận đơn và chụp ảnh xác nhận kiện hàng.'
  ],
  [
    'NSPhotoLibraryUsageDescription',
    'ROLL CÂY CẢNH cần truy cập ảnh để chọn ảnh nhãn hoặc ảnh kiện hàng làm bằng chứng đóng gói.'
  ]
];

for (const [key, value] of privacyEntries) {
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

  const rootClose = plist.lastIndexOf('</dict>');

  if (rootClose < 0) {
    fail('Info.plist has no root </dict> element.');
  }

  plist =
    plist.slice(0, rootClose) +
    entry +
    plist.slice(rootClose);
}

fs.writeFileSync(
  plistFile,
  plist,
  'utf8'
);

// Bắt buộc hỗ trợ cả iPhone và iPad.
let project = fs.readFileSync(
  pbxproj,
  'utf8'
);

if (!/TARGETED_DEVICE_FAMILY\s*=\s*[^;]+;/.test(project)) {
  fail(
    'Xcode project has no TARGETED_DEVICE_FAMILY setting.'
  );
}

project = project.replace(
  /TARGETED_DEVICE_FAMILY\s*=\s*[^;]+;/g,
  'TARGETED_DEVICE_FAMILY = "1,2";'
);

if (!/TARGETED_DEVICE_FAMILY\s*=\s*"1,2";/.test(project)) {
  fail(
    'Failed to configure iPhone+iPad device family (1,2).'
  );
}

fs.writeFileSync(
  pbxproj,
  project,
  'utf8'
);

console.log(
  'iOS preparation passed: plugin path, custom controller, ' +
  'storyboard, privacy descriptions, and iPhone/iPad target checked.'
);

console.log(`Bundle ID: ${bundleId}`);
