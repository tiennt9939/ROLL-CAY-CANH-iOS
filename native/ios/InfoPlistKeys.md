# Generated iOS Info.plist additions

Add these entries to the **generated** `ios/App/App/Info.plist` after creating the Capacitor iOS platform:

- `NSCameraUsageDescription` (String): `ROLL CÂY CẢNH cần camera để quét mã vận đơn và chụp ảnh xác nhận kiện hàng.`
- `NSPhotoLibraryUsageDescription` (String): `ROLL CÂY CẢNH cần truy cập ảnh để chọn ảnh nhãn hoặc ảnh kiện hàng làm bằng chứng đóng gói.`

Do not add microphone permission. Do not invent a Google reversed-client URL scheme; that must come from the approved Google OAuth iOS client. The owner approved Bundle ID `vn.rollgardencanh.app` on 2026-10-21; keep it identical in Xcode, Apple Developer, Firebase and Google OAuth.
