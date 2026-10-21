# R4 — iPad target and hosted macOS build pipeline

Date: 2026-10-21

- Owner-approved Bundle ID finalized in the iOS workspace: `vn.rollgardencanh.app`.
- Added a GitHub Actions macOS 15 workflow that validates source, generates the Capacitor iOS project, prepares the native bridge, registers the Swift plugin in the Xcode target, and builds an unsigned iOS Simulator app.
- Added an optional signed IPA export path, gated behind explicit manual workflow input and Apple signing secrets.
- Added an automated preparation script for native plugin registration, camera/photo permissions and universal iPhone+iPad target family.
- Added documentation for the iPadOS 17.7.11 QA target and the signing-secret setup.
- Kept Android V26.2.92 source and business logic unchanged in this separate workspace.

## Validation

- `npm run validate`: PASS, 86/86 business/contract tests.
- Inline JavaScript syntax: 4/4 blocks pass.
- Swift parser check: PASS (syntax only, not Xcode SDK typecheck).
- `prepare-ios-platform.mjs`: passed a synthetic generated-project fixture.
- Workflow YAML parses as YAML; GitHub Actions execution has not yet occurred.

## Still not verified

No hosted macOS workflow has run yet; no Xcode build, signed IPA, Apple account, Firebase iOS registration, Google Drive OAuth, real TikTok PDF parity, or iPad installation test has been completed. Do not treat this package as release-ready until those gates pass.
