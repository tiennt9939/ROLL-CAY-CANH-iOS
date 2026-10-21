# ROLL CÂY CẢNH iOS integration — R2

Baseline remains Android V26.2.92 / versionCode 144. No Android main source was changed.

## Changes in R2

1. Added coordinate-aware PDFKit extraction based on `PDFPage.characterBounds(at:)`. It groups glyphs by visual row, detects the TikTok table header, derives the X boundaries from `Product Name / SKU / Seller SKU / Qty`, emits structured `tableRows`, appends wrapped lines to the active product row, and stops at the `Qty Total` / `Order ID` footer. When a table/header cannot be reconstructed, it returns an empty `tableRows` and the original text remains available to the tested parser fallback.
2. Moved PDF reading/table reconstruction to a background queue and retained security-scoped URL access until extraction completes to avoid blocking the UI on large imports.
3. Added native share-sheet export for CSV/text data and isolated temporary export paths to prevent concurrent exports with the same filename from overwriting one another.
4. Added runtime-aware Vision OCR language selection so the code requests Vietnamese/English only when supported by that iOS runtime.
5. Added an additional contract test for PDF table extraction/export; maintained all 84 inherited V26.2.92 regression tests.
6. Updated status and setup docs. The original web parser and Firebase/Firestore schemas remain unchanged.

## Local verification

- JavaScript syntax checks: pass.
- Workspace preflight: pass.
- Local regression/contract suite: 86/86 pass.
- Android source preflight on the saved V26.2.92 reference: pass.
- `swiftc -frontend -parse`: pass.

## Not verified / must not be represented as complete

- This Linux syntax parse is not an iOS SDK typecheck or Xcode build.
- No real TikTok PDF was available here for comparison against Android PDFBox. PDFKit coordinate extraction is a draft until validated page-by-page on representative PDFs.
- Google Drive iOS OAuth and real upload/download remain disabled. Photo confirmation must not be accepted if the upload fails; retain the durable local queue.
- The Capacitor dependency install did not complete in this environment, so no package lock/Xcode project/IPA is included.
- No signing, TestFlight, physical iPhone or 65 × 100 mm label printer test has run.
- The Bundle ID remains provisional pending owner approval.
