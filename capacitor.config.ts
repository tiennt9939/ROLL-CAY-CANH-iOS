import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.rollgardencanh.app', // Owner approved on 2026-10-21; keep consistent across Apple/Firebase/OAuth.
  appName: 'ROLL CÂY CẢNH', // Confirmed App Store / iPhone display name.
  webDir: 'web',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
