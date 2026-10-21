# ROLL CÂY CẢNH — iOS integration checklist (V26.2.92)

This workspace adds an iOS native bridge around the existing V26.2.92 JavaScript core. It is **not an App Store release candidate yet**. This Linux environment has no Xcode/macOS SDK, so no honest iOS build, signing, IPA, TestFlight or physical iPhone test can be performed here.

## Work included in this iteration

- `web/roll-platform-bridge.js`: iOS-only compatibility layer so the original Android WebView business code can call selected Capacitor methods without rewriting the business algorithms.
- `native/ios/Plugins/RollPlatformPlugin.swift`: PDF picker and coordinate-aware table extraction draft, Vision OCR, native share-sheet export for PDF/CSV/text files, AirPrint UI, barcode scan + package photo capture, durable local queue for daily-shipment photos and safe queue recovery.
- Daily shipment queue metadata retains employee and admin-delegation fields during crash recovery. The intended payee must remain the assigned employee; do not drop `adminDelegateAssignedUid`/revision/UID fields.
- Android source and Android main branch are not modified.

## Required setup on a Mac

1. Install a current Xcode with its iOS SDK, Node.js LTS, and CocoaPods if required by the Capacitor version.
2. From this folder run `npm install`, then `npx cap add ios`, and `npx cap sync ios`. The Capacitor iOS host injects its runtime globals and plugin proxies at document start. Copy `native/ios/Plugins/RollPlatformPlugin.swift` into the App group and add it to **Target Membership** in Xcode.
3. In `ios/App/App/BridgeViewController.swift` (or the generated bridge entry point), register the custom plugin using the API supported by the installed Capacitor version, e.g. `bridge?.registerPluginInstance(RollPlatformPlugin())`. Confirm `RollPlatform` appears in the JavaScript plugin registry on the simulator.
4. In the generated app `Info.plist`, add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` from `native/ios/InfoPlistKeys.md`. No microphone permission is needed. The PDF picker uses the iOS document picker.
5. The owner approved Bundle ID `vn.rollgardencanh.app` on 2026-10-21. Keep it identical in `capacitor.config.ts`, Xcode, Apple Developer, Firebase and Google OAuth. Use the GitHub Actions workflow to generate/build the Xcode project, then test on the owner’s iPad running iPadOS 17.7.11.
6. Run `npm run validate`. Then manually test login, Firestore sync, plant inventory, the exact payroll rules, employee assignment, delegated Admin scans, duplicate blocking, photos, PDF import, exports, printing and reconnect/retry after force-quitting the app. `npm run validate` does not build an IPA.

## Google Drive is a release blocker

The iOS plugin deliberately rejects Drive operations until the owner configures a real iOS Google OAuth client, its reversed URL scheme, scopes and account handling. The web Firebase config is not the Google Drive OAuth client ID. Do not place a client secret in the app, do not switch to Firebase Storage, and do not show “connected” until the OAuth flow and a real file upload/download have been verified. Once the iOS OAuth client is configured, implement and test `connectGoogleDrive`, `isDriveConnected`, `uploadDriveImage`, `downloadDriveImage` and the Drive folder verification against the same intended `QuanLyCayAPK_Images` folder/account behavior.

## PDF-import parity is also a release gate

Android V26.2.92 uses a coordinate-aware PDF table extractor and already has regression fixtures/tests. The iOS PDFKit path now includes a coordinate-aware extractor using `PDFPage.characterBounds(at:)`, producing `tableRows` when it can detect the `Product Name / SKU / Seller SKU / Qty` header. This is an implementation draft, not proven parity: no real TikTok PDF was available in this workspace for a native iOS comparison, and PDFKit geometry differs from PDFBox. Do not use iOS imports for production until representative real PDFs are checked page by page and combo/gift, `Qty`, continuation-page and exact-Order-ID merge tests pass on the iOS output.

## CSV/text exports

- CSV and text reports use the native iOS share sheet so the user can choose Save to Files or another destination. The app only reports a completed share after iOS returns that result.

## Print and update differences

- Export PDF opens the native share sheet; users can save to Files.
- Printing opens iOS AirPrint. A physical label printer must be tested for an actual 65 × 100 mm paper size; opening the system print dialog alone does not prove exact label sizing or FlashLabel compatibility.
- iOS updates are distributed through the App Store/TestFlight. APK download/install is not used on iOS.

## Owner decisions still needed

- Final Bundle ID: `vn.rollgardencanh.app` is only a proposal and is not approved for signing/OAuth/App Store use.
- Google Drive iOS OAuth client / URL scheme setup, then real-device verification.
- App Store Connect signing and release credentials.
