# ROLL CÂY CẢNH iOS — implementation plan and guardrails

## Verified source baseline
- Source archive: `QuanLyCayAPK-V26.2.92-EMPLOYEE-PDF-PAYROLL-ATTRIBUTION-FIX-AUTO-UPDATE-SOURCE.zip`
- SHA-256: `e452c646c17ff6522e473fcfac068d21ba6350f1824e1e1da6215ff0a993309d`
- Android source metadata: `versionName = 26.2.92`, `versionCode = 144`.
- V26.2.92 adds `adminDelegateAssignedUid` as a candidate when attributing Admin-delegated daily scans in the employee report. Rows with `wageRecorded === false` remain excluded from wages.
- Source regression report: 84 JavaScript tests, no failures; Android preflight passed. The user confirmed that the payroll-attribution fix works in real use.

## Current workspace contents
- Copies the baseline's web files into `web/`; the Android repository remains untouched.
- Keeps the original Android tree, Firestore rules/indexes and business regression tests in `reference/` for audit only.
- Adds `web/roll-platform-bridge.js` for iOS-only adaptation of selected native calls while retaining the existing callback contracts where possible.
- Adds a draft Capacitor Swift plugin at `native/ios/Plugins/RollPlatformPlugin.swift` for PDF selection plus coordinate-aware `Product Name / SKU / Seller SKU / Qty` extraction, Vision OCR, camera barcode scanning and proof-photo capture, local retry-queue persistence, PDF/CSV/text share/export and system printing.
- The native queue persists assignment and Admin-delegation metadata, including `adminDelegateAssignedUid`, to avoid losing employee attribution during retry/recovery.
- Adds iOS bridge/PDF-native-export contract tests. Combined local suite: 86/86 pass.

## Not completed / release blockers
1. **Google Drive iOS OAuth is not implemented.** Native Drive methods fail closed and `isDriveConnected` returns false. This is deliberate; no upload, download or connected status is fabricated. Do not silently switch to Firebase Storage or a second data store. A real iOS OAuth client, URL scheme, scopes/token handling and real Drive upload/download test are required.
2. **TikTok PDF parser parity is not established.** iOS now attempts coordinate-aware extraction using `PDFPage.characterBounds(at:)` and emits `tableRows`; this code has only been syntax-parsed and contract-tested in Linux, not run against a real TikTok PDF on iOS. `SKU → Seller SKU → Product Name`, combo/gift quantities, multi-page continuation and exact Order ID merge must pass against real PDFs before production import.
3. **The generated Xcode project does not exist in this workspace.** Capacitor packages are declared but not installed/locked; dependency installation timed out in the current environment. A Mac build machine must run `npm install`, commit the generated lockfile, then `npx cap add ios` and `npx cap sync ios`. The bridge uses the Capacitor native-injected `window.Capacitor`/`Plugins` registry; it does not depend on a remote JavaScript bundle.
4. **Native typecheck/build/signing is not run.** Swift parser syntax passed only. The custom plugin must be added to the generated Xcode target, registered by the bridge controller, and compiled against the actual Capacitor 7/iOS SDK.
5. **Final Bundle ID is not approved.** `vn.rollgardencanh.app` is provisional. Owner approval is required before signing, OAuth or App Store Connect.
6. **Physical device/printer testing remains.** Camera permissions, barcode support, PDF output, AirPrint, and physical 65 × 100 mm label dimensions need real hardware verification. FlashLabel compatibility is not established.

## Must-preserve business rules
- Keep the same Firebase project/data schema and Firestore rules; do not create a second app-specific payroll datastore or new collections.
- Preserve existing inventory, plant catalogue, pricing, payroll formulas, assignment rules, duplicate guards and data retention logic.
- Preserve `adminDelegateAssignedUid` attribution for Admin-delegated scans and exclude every `wageRecorded === false` row from wage totals.
- Preserve `SKU → Seller SKU → Product Name`, combo/gift arithmetic, quantity multipliers, and same-Order-ID line/page merging.
- A native photo must not be acknowledged/deleted from the local retry queue until the required Drive upload and Firestore completion are genuinely confirmed.
- Keep the Android `main` branch/source unchanged. The iOS changes belong only in this separate workspace.

## Owner decisions
- Display name `ROLL CÂY CẢNH`: confirmed.
- Final Bundle ID: **not confirmed**. Suggested `vn.rollgardencanh.app` remains only a proposal.
- Google Drive iOS OAuth app configuration and Apple signing/TestFlight access must be supplied/configured before a release build.
