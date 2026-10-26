#!/usr/bin/env bash
# Прогон APK на эмуляторах: телефон и планшет (этап M5).
#
#   ./scripts/emulator-test.sh phone|tablet [путь к APK]
#
# Скрипт создаёт AVD при первом запуске, поднимает его без окна,
# ставит APK, открывает приложение и снимает скриншот в docs/screenshots/.
set -euo pipefail

DEVICE="${1:-phone}"
APK="${2:-android/app/build/outputs/apk/debug/app-debug.apk}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
IMAGE="system-images;android-34;google_apis;arm64-v8a"

case "$DEVICE" in
  phone)  AVD="hc_phone";  PROFILE="pixel_6" ;;
  tablet) AVD="hc_tablet"; PROFILE="pixel_tablet" ;;
  tablet7) AVD="hc_tablet7"; PROFILE="Nexus 7" ;;
  *) echo "Неизвестное устройство: $DEVICE (phone|tablet|tablet7)"; exit 1 ;;
esac

export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="$SDK/platform-tools:$SDK/emulator:$SDK/cmdline-tools/latest/bin:$PATH"

if [ ! -f "$APK" ]; then
  echo "Нет APK: $APK"
  exit 1
fi

if ! avdmanager list avd | grep -q "Name: $AVD"; then
  echo "Создаю AVD $AVD ($PROFILE)…"
  echo "no" | avdmanager create avd --name "$AVD" --package "$IMAGE" --device "$PROFILE" --force
fi

echo "Запускаю эмулятор $AVD…"
emulator -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
  -netdelay none -netspeed full > "/tmp/emulator-$DEVICE.log" 2>&1 &
EMULATOR_PID=$!

adb wait-for-device
echo -n "Ожидание загрузки"
for _ in $(seq 1 90); do
  BOOTED=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  if [ "$BOOTED" = "1" ]; then break; fi
  echo -n "."
  sleep 2
done
echo

mkdir -p docs/screenshots
echo "Устанавливаю APK…"
adb install -r "$APK"

adb logcat -c || true
adb shell am start -n pro.holychords.offline/.MainActivity > /dev/null
sleep 8

echo "Скриншот: docs/screenshots/$DEVICE.png"
adb exec-out screencap -p > "docs/screenshots/$DEVICE.png"

echo "--- ошибки приложения в logcat ---"
adb logcat -d | grep -iE 'holychordsoffline|capacitor|AndroidRuntime' | tail -20 || true

echo "Эмулятор остановить: kill $EMULATOR_PID (или adb emu kill)"
