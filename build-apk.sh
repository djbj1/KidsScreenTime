#!/bin/bash
set -e

echo "=== 1. Building React Frontend ==="
cd /root/ScreenTimeOrga/client
npx vite build

echo "=== 2. Syncing Capacitor Assets ==="
cd /root/ScreenTimeOrga
npx cap sync android

echo "=== 3. Compiling Android APK ==="
cd /root/ScreenTimeOrga/android
export ANDROID_HOME=/usr/lib/android-sdk
./gradlew assembleDebug

echo "=== 4. Publishing APK to Server Download Path ==="
mkdir -p /root/ScreenTimeOrga/public
cp /root/ScreenTimeOrga/android/app/build/outputs/apk/debug/app-debug.apk /root/ScreenTimeOrga/public/screentime.apk

echo "=== SUCCESS: APK built successfully! ==="
echo "Download URL: http://192.168.178.227:3000/screentime.apk"
