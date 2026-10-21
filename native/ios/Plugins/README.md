# RollPlatform iOS native bridge

`RollPlatformPlugin.swift` contains the first native implementations for PDF selection/text extraction, Vision OCR, share-sheet PDF export, AirPrint UI, barcode/photo capture, and a durable daily-shipment photo queue.

Before build:
- Generate the Capacitor iOS project on macOS (`npx cap add ios`; `npx cap sync ios`).
- Ensure this Swift file belongs to the generated App target and register `RollPlatformPlugin()` from the generated `BridgeViewController` using the supported Capacitor 7 API.
- Add `NSCameraUsageDescription` in the generated Info.plist.
- Configure the final Bundle ID and signing.

Not complete yet:
- Google Drive OAuth and verified upload/download are intentionally rejected; the bridge does not claim success.
- The PDF parser does not yet reproduce Android's coordinate-aware `tableRows` extraction.
- Printing uses the iOS system UI; fixed label stock size and FlashLabel compatibility require physical-printer tests.
- This file has not been compiled against Xcode/iOS SDK in this environment.
