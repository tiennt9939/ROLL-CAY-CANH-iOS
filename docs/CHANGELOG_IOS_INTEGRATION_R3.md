# ROLL CÂY CẢNH iOS integration — R3

Baseline: Android V26.2.92 / versionCode 144. This is a separate iOS workspace; Android main source has not been changed by these edits.

## Changes in R3

1. OCR failures now reject the native operation, allowing the JavaScript bridge to show an actionable error instead of silently treating a failed recognition as an empty OCR result.
2. The coordinate-aware PDF reader now recognizes compacted `Qty Total` / `Order ID` footer forms even if whitespace or punctuation is not reconstructed exactly.
3. The export adapter uses explicit `window.Capacitor` / `window.RollPlatform` references for more reliable WebView access.
4. Expanded the iOS bridge contract test for native share-sheet completion and visible OCR failure handling.
5. Added `scripts/validate-workspace.mjs` and a `npm run validate` command that consistently checks JavaScript syntax, inline scripts, preflight, inherited regression tests and (when installed) the saved Android source audit / Swift syntax parse.
6. No Firebase collection/schema, wage formula, employee assignment, catalog matching or TikTok JavaScript parser was changed.

## Verification in this environment

- `npm run validate`: pass.
- Business + iOS bridge/PDF contract suite: 86/86 pass.
- Inline JS blocks in `web/index.html`: syntax checks pass.
- Android V26.2.92 source preflight: pass.
- Swift frontend syntax parse: pass only; it is not UIKit/Capacitor SDK typechecking or an Xcode build.

## Open release blockers

- Google Drive iOS OAuth/API methods are intentionally fail-closed and are not implemented yet; the camera/photo workflow cannot be signed off for production until uploads/downloads are actually verified.
- Coordinate-aware PDFKit extraction is code-only until tested against representative TikTok PDFs on iOS and compared page-by-page with Android output.
- No generated Xcode project, SDK build, signed IPA, TestFlight installation, or physical iPhone test is available in this Linux environment.
- Bundle ID `vn.rollgardencanh.app` remains provisional, not owner-approved.
- Physical 65 × 100 mm label output / FlashLabel compatibility remains unverified.
