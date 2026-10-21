# iOS implementation status — 21 October 2026

## Current milestone
The iOS workspace has progressed from a bare bootstrap to a native-bridge integration draft. It can be reviewed and carried to a Mac/Xcode machine for integration work, but it must not be described as a completed iOS app or release candidate.

## Local verification performed
- `npm run validate`: pass, including JS source/inline-block syntax checks, the business suite, Android source preflight and Swift syntax parse where tools are installed.
- `node --check web/roll-platform-bridge.js`: pass.
- `node --check scripts/preflight.mjs`: pass.
- `node scripts/preflight.mjs`: pass.
- `node scripts/run-business-tests.mjs`: **86 total, 0 failures** (84 inherited business/regression tests plus two iOS contract tests).
- `swiftc -frontend -parse native/ios/Plugins/RollPlatformPlugin.swift`: syntax parse passed. This does not typecheck against UIKit, Vision, AVFoundation or Capacitor SDKs.
- `python reference/tools/preflight.py`: pass against the saved V26.2.92 Android source reference.

## Implemented in this workspace
- iOS-only `AndroidBridge` compatibility adapter to selected native APIs; Android bridge behavior is not overwritten on Android.
- Native draft for iOS PDF selection and coordinate-aware `tableRows` extraction via `PDFPage.characterBounds(at:)`, Vision OCR, barcode scan and photo capture, durable daily-shipment photo retry queue, PDF/CSV/text share sheet and iOS print UI.
- CSV/text export takes the asynchronous native share-sheet route instead of pretending the Android synchronous file-save API succeeded.
- Retry metadata keeps delegated employee fields including `adminDelegateAssignedUid`.
- iOS-specific user-facing update/export messaging.

## Critical gaps
- **Drive OAuth and real Drive file operations: not implemented/configured.** Photo workflow is not production ready; plugin intentionally rejects these methods.
- **PDF recognition parity: not proven.** iOS now has a coordinate-aware extractor draft, but no real TikTok PDF was run through the native PDFKit method and there is no Apple SDK runtime test here. Validate `Product Name / SKU / Seller SKU / Qty`, combo/gift, continuation rows and exact Order ID merge with real PDFs before relying on imports.
- **No Xcode project, no successful Xcode build, no signed IPA, no TestFlight build and no real iPhone test.** Environment lacks macOS/Xcode.
- **Bundle ID is provisional.** Owner approval is still required.
- Printer paper sizing and FlashLabel connection remain unverified.
- Dependency installation did not complete here, so no lockfile is provided; install dependencies and create/commit the lockfile on the Mac build machine.

## Recommended next sequence
1. Owner confirms the final Bundle ID; set the same ID in Capacitor and the generated Xcode target.
2. On macOS: install Node.js/Xcode, run `npm install`, commit the lockfile, generate the iOS platform with `npx cap add ios` and `npx cap sync ios`.
3. Add `native/ios/Plugins/RollPlatformPlugin.swift` to the Xcode target, merge `BridgeViewController.swift.template` into the generated bridge controller, add the camera privacy key from `native/ios/InfoPlistKeys.md`, and fix all actual SDK/typecheck errors.
4. Configure a real Google Drive iOS OAuth client and implement/token-test all Drive methods against the existing account/folder behavior. Do not use the app until upload/retry/Firestore completion can be verified end-to-end.
5. After compiling on macOS, run the coordinate-aware PDF extractor on real representative TikTok PDFs and compare its structured rows to Android V26.2.92 for combos, gifts, quantity multipliers, continuation rows, and multiple pages with one exact Order ID.
6. Test login, Firebase sync, assignment, inventory, payroll attribution and wage exclusions, duplicate scan prevention, photo retry after force-quit, quote exports and physical label printing on a real iPhone.
7. Only after all blockers pass: archive/sign, install on TestFlight and verify upgrade/data continuity before App Store submission.


## R4 status update (2026-10-21)

- Owner approved Bundle ID `vn.rollgardencanh.app`; the workspace config now uses it as the final approved value.
- Test target is an iPad running iPadOS 17.7.11.
- Added hosted macOS GitHub Actions workflow for source validation and unsigned Simulator build, plus optional signed IPA export when Apple signing secrets are configured.
- Still waiting for the first real workflow run, Apple Developer membership status, Firebase iOS configuration, Google Drive OAuth, representative redacted TikTok PDFs, and iPad functional testing.
