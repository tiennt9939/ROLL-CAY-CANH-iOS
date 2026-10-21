# Build ROLL CÂY CẢNH iOS with GitHub Actions

Bundle ID approved by the owner on 2026-10-21: `vn.rollgardencanh.app`. Display name: `ROLL CÂY CẢNH`. Intended test device: iPad running iPadOS 17.7.11.

## What the workflow does

`.github/workflows/ios-build.yml` runs on a hosted macOS 15 runner. It installs Node dependencies, runs source validation, generates the Capacitor iOS project, copies/registers `RollPlatformPlugin`, adds camera/photo permissions, forces universal iPhone+iPad support, synchronizes the web assets and builds an unsigned Simulator `.app` for QA. The Simulator ZIP is **not an IPA and cannot be installed directly on a physical iPad**.

To run it, place this workspace in a dedicated GitHub repository (recommended repository name: `ROLL-CAY-CANH-iOS`; do not put the ZIP into the Android repository's root or its Android auto-update source ZIP path), then open **Actions → ROLL CAY CANH iOS Build → Run workflow**. First run with `signed_ipa=false` to verify that Xcode can compile the project.

## To export a signed IPA

The owner must have valid Apple signing assets and configure these GitHub repository Actions secrets:

- `IOS_CERTIFICATE_BASE64`: base64 of an Apple Distribution `.p12` certificate.
- `IOS_CERTIFICATE_PASSWORD`: password used to export that `.p12`.
- `IOS_PROVISIONING_PROFILE_BASE64`: base64 of an App Store distribution provisioning profile for `vn.rollgardencanh.app`.
- `IOS_TEAM_ID`: Apple Developer Team ID.

Then run the workflow with `signed_ipa=true`. The profile and certificate must match the same Apple Developer team, Bundle ID and distribution method. Do not send the `.p12`, password, private key, provisioning profile or Apple login/2FA codes in chat. If Apple Developer Program membership is not active, resolve that before expecting TestFlight/App Store distribution.

## Current release blockers that the build does not solve

- Google Drive OAuth is intentionally gated until a real iOS OAuth client and URL scheme are configured and tested. No Drive upload/download success should be reported yet.
- PDF import needs redacted real TikTok PDFs and page-by-page comparison against Android V26.2.92.
- The signed IPA needs installation and functional testing on the owner's iPad (iPadOS 17.7.11), especially login, Firestore, PDF imports, payroll attribution, photo upload/retry, and printing.
- An unsigned Simulator build is only a compilation milestone; it is not a release candidate.
