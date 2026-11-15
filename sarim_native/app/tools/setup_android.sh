#!/usr/bin/env bash
# Generates the Android host project (needs the Flutter SDK) and applies Sarim settings.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/gen_config.mjs
if [ ! -d android ]; then
  flutter create --org com.gullzubair --project-name sarim_native --platforms android --no-pub .
fi
# flutter create adds a template test that references a MyApp class we do not have
rm -f test/widget_test.dart
RES=android/app/src/main/res
SRC=../../android/app/src/main/res
for d in "$SRC"/mipmap-*; do cp -r "$d" "$RES/"; done
mkdir -p "$RES/values"
cp "$SRC/values/ic_launcher_background.xml" "$RES/values/" 2>/dev/null || true
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('android/app/src/main/AndroidManifest.xml')
m = p.read_text()
if 'android.permission.INTERNET' not in m:
    m = m.replace('<application', '    <uses-permission android:name="android.permission.INTERNET" />\n    <application', 1)
m = re.sub(r'android:label="[^"]*"', 'android:label="Gull &amp; Zubair"', m, count=1)
p.write_text(m)
PY
echo "Android project ready. Next: flutter pub get && flutter test && flutter build apk --release"
