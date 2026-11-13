# Sarim - Flutter app

Flutter (Android) host for the Sarim web app. The full web app (every screen, module and
offline database) is bundled in `assets/www` and served to a WebView from `http://localhost:8765`
by `InAppLocalhostServer`, so behaviour is identical to the web/Capacitor build.
`assets/bridge/capacitor_shim.js` re-creates the `window.Capacitor.Plugins.*` API the web code
uses (`modules/native.js`) and `lib/native_bridge.dart` + `android_overrides/MainActivity.kt` implement it.

| Web app feature | Flutter implementation |
|---|---|
| Save PDF/CSV/backup to Downloads, open file | `SaveFile` -> MediaStore (Kotlin) |
| Share files/text, WhatsApp chat/text | `Share` (share_plus), `DirectShare` (whatsapp:// link) |
| Cache files / wipe data | `Filesystem` (path_provider) |
| Haptics | `Haptics`, `HapticFeedback` |
| App lock biometrics / device PIN | `NativeBiometric` (local_auth) |
| Local notifications + tap -> open screen | `LocalNotifications` (flutter_local_notifications) |
| Back button, exit, external links | `App` |
| GPS, camera, photo capture | native WebView permissions (geolocation / getUserMedia) |

## Build
```bash
npm ci
node flutter_app/tools/sync_web.mjs --build   # build web app -> assets/www + pubspec asset list
node flutter_app/tools/verify_parity.mjs      # completeness check (must pass)
bash flutter_app/tools/setup_android.sh       # flutter create + manifest/Kotlin overrides
cd flutter_app && flutter pub get && flutter build apk --release
```
CI does the same in `.github/workflows/flutter.yml`.

## Known differences from the Capacitor app
- Remote push (FCM) is not bridged: approval alerts arrive via in-app local notifications only.
- "Share to a WhatsApp chat" with images/PDFs uses the system share sheet (text and chat links open WhatsApp directly).
- The app origin is `http://localhost:8765`, so data stored by the existing Capacitor app is not
  visible here; restore through the in-app backup or cloud sync.
- Release builds are debug-signed unless you add your own keystore.
