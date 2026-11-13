#!/usr/bin/env bash
# Generates the Android host project (needs the Flutter SDK) and applies Sarim's native overrides.
# Run from anywhere: bash flutter_app/tools/setup_android.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d android ]; then
  flutter create --org com.gullzubair --project-name sarim --platforms android --no-pub .
fi

KT=android/app/src/main/kotlin/com/gullzubair/sarim
mkdir -p "$KT"
cp android_overrides/MainActivity.kt "$KT/MainActivity.kt"

# Launcher icons + splash colour from the existing Capacitor project
RES=android/app/src/main/res
SRC=../android/app/src/main/res
for d in "$SRC"/mipmap-*; do cp -r "$d" "$RES/"; done
mkdir -p "$RES/values"
cp "$SRC/values/ic_launcher_background.xml" "$RES/values/" 2>/dev/null || true

python3 - <<'PY'
import re, pathlib
manifest = pathlib.Path('android/app/src/main/AndroidManifest.xml')
m = manifest.read_text()
perms = [
  'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.CAMERA',
  'android.permission.VIBRATE', 'android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT',
  'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_MEDIA_IMAGES', 'android.permission.POST_NOTIFICATIONS',
]
lines = ''.join(f'    <uses-permission android:name="{p}" />\n' for p in perms if p not in m)
if 'WRITE_EXTERNAL_STORAGE' not in m:
  lines += '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />\n'
  lines += '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n'
for f in ('location', 'location.gps', 'fingerprint', 'camera', 'camera.autofocus'):
  tag = f'android.hardware.{f}'
  if tag not in m:
    lines += f'    <uses-feature android:name="{tag}" android:required="false" />\n'
m = m.replace('<application', lines + '    <application', 1) if lines else m
if 'usesCleartextTraffic' not in m:  # the app is served from http://localhost inside the WebView
  m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"', 1)
m = re.sub(r'android:label="[^"]*"', 'android:label="Gull &amp; Zubair"', m, count=1)
if '<queries>' not in m:
  q = '''    <queries>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="whatsapp" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
'''
  m = m.replace('<application', q + '    <application', 1)
manifest.write_text(m)

# local_auth needs an AppCompat launch theme because MainActivity is a FragmentActivity
for p in pathlib.Path('android/app/src/main/res').glob('values*/styles.xml'):
  s = p.read_text()
  s2 = re.sub(r'parent="@android:style/Theme\.(Light|Black)\.NoTitleBar"', 'parent="Theme.AppCompat.DayNight.NoActionBar"', s)
  if s2 != s: p.write_text(s2)
PY
echo "Android project ready. Next: flutter pub get && flutter build apk --release"
