#!/usr/bin/env bash
# Some Flutter plugins still call getDefaultProguardFile('proguard-android.txt'), which current Android Gradle
# Plugin versions reject ("includes -dontoptimize"). Switch them to the optimizing default file.
# Run after `flutter pub get` and before `flutter build`. Safe to run repeatedly.
set -euo pipefail
CACHE="${PUB_CACHE:-$HOME/.pub-cache}/hosted"
[ -d "$CACHE" ] || { echo "No pub cache at $CACHE"; exit 0; }
n=0
while IFS= read -r f; do
  sed -i "s/proguard-android\.txt/proguard-android-optimize.txt/g" "$f"
  echo "patched $f"
  n=$((n+1))
done < <(grep -rl --include='build.gradle' --include='build.gradle.kts' "proguard-android\.txt" "$CACHE" 2>/dev/null || true)
echo "Patched $n plugin build file(s)."
