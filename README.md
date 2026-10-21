# ROLL CÂY CẢNH — iOS integration workspace (V26.2.92)

This is an **enhanced iOS integration workspace**, not a signed IPA and **not yet safe for production use**.

- Baseline: verified Android V26.2.92, versionCode 144.
- Display name: `ROLL CÂY CẢNH` (confirmed).
- Web core and regression fixtures: copied to this separate workspace; Android source/repository is not changed by this workspace.
- Native compatibility bridge: `web/roll-platform-bridge.js`.
- Swift native plugin draft: `native/ios/Plugins/RollPlatformPlugin.swift`.
- Setup and release blockers: `docs/IOS_NATIVE_SETUP.md`, `docs/IOS_STATUS_2026-10-21.md`, and `docs/CHANGELOG_IOS_INTEGRATION_R3.md`.
- Regression tests: 86 tests pass in the current local suite, including all 84 inherited V26.2.92 regression tests and two iOS contract tests.
- Run the repeatable checks with `npm run validate`. A successful run is still only source validation and Swift syntax parsing—not an Apple SDK typecheck, Xcode build, signed IPA, or iPhone test.

## Do not release yet

1. Google Drive iOS OAuth is deliberately disabled. Photo upload/download must not be reported as successful until a real iOS OAuth client is configured and verified. This blocks the production photo-confirmation workflow.
2. iOS has a coordinate-aware PDFKit table extractor draft and CSV/text share-sheet export. PDF import parity remains unproven until real TikTok PDFs are checked on iOS.
3. The owner approved Bundle ID `vn.rollgardencanh.app` on 2026-10-21. Use this exact value for the Xcode target, Apple identifiers, Firebase iOS app and Google OAuth client; do not silently change it.
4. The GitHub Actions workflow can generate/build the iOS project on a hosted macOS runner. A signed distributable IPA still requires Apple signing assets; an iPad with iPadOS 17.7.11 is the target test device. Local Linux checks do not replace Xcode build/device testing. AirPrint/65 × 100 mm label output also needs physical printer testing.

Read `docs/IOS_NATIVE_SETUP.md` and `docs/GITHUB_ACTIONS_IOS.md` before running native setup. Keep all work in this directory; do not put the iOS workspace into the Android repository's auto-update source ZIP path.
