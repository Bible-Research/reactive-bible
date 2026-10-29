#!/usr/bin/env bash
# Dynamic install test for a release APK on a running emulator /
# device (adb must already see exactly one device).
#
#   scripts/android-install-test.sh NEW_APK [OLD_APK]
#
# Gating checks (non-zero exit if any fails):
#   fresh      - `adb install` NEW on a clean device
#   update     - install OLD, then `adb install -r` NEW (same-cert
#                in-place update — the path a phone update takes)
#   pm-update  - same, but via `pm install -r` from device storage
#   launch     - the updated app starts and stays alive
#   ui-install - the real PackageInstaller UI is fed NEW from
#                /sdcard/Download (the phone's "tap the downloaded
#                APK" path) and must NOT show the parse-error
#                dialog ("There was a problem parsing the package")
#
# Results go to $OUT_DIR (default install-test-out): results.txt,
# logcat.txt, installer-filtered.txt, ui-*.xml, screenshots.
set -u

NEW=${1:?usage: $0 NEW_APK [OLD_APK]}
OLD=${2:-}
PKG=com.bibleresearch.app
OUT=${OUT_DIR:-install-test-out}
mkdir -p "$OUT"
: > "$OUT/results.txt"
FAIL=0

API=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
REL=$(adb shell getprop ro.build.version.release | tr -d '\r')
echo "Device API $API (Android $REL)" | tee -a "$OUT/results.txt"

record() { # name status detail
  echo "RESULT api$API $1 $2 $3" | tee -a "$OUT/results.txt"
  if [ "$2" != PASS ] && [ "$2" != INFO ]; then
    FAIL=1
    echo "::error::api$API $1 failed: $3"
  fi
}

check_install() { # name cmd...
  local name=$1 out
  shift
  out=$("$@" 2>&1 | tr -d '\r')
  echo "$out"
  if echo "$out" | grep -q '^Success'; then
    record "$name" PASS "Success"
  else
    record "$name" FAIL \
      "$(echo "$out" | grep -oE '(INSTALL|Failure)[^ ]*.*' | head -1)"
  fi
}

reset_pkg() {
  adb uninstall "$PKG" > /dev/null 2>&1 || true
}

installed_version() {
  adb shell dumpsys package "$PKG" | tr -d '\r' | \
    grep -m2 -E 'versionCode|versionName' | xargs
}

aapt_badging() { # apk
  local bt
  bt=$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | \
    tail -1)
  "$bt/aapt2" dump badging "$1" 2>/dev/null
}

# Tap the first enabled UI node whose text / content-desc fully
# matches the (case-insensitive) regex. Returns 1 if none.
tap_text() { # regex
  local xml="$OUT/tap.xml" xy
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$xml" > /dev/null 2>&1 || return 1
  xy=$(python3 - "$xml" "$1" << 'PY'
import re
import sys
import xml.etree.ElementTree as ET

pat = re.compile(sys.argv[2], re.I)
try:
    nodes = list(ET.parse(sys.argv[1]).iter('node'))
except ET.ParseError:
    nodes = []
for n in nodes:
    t = (n.get('text') or n.get('content-desc') or '').strip()
    if t and pat.fullmatch(t) and n.get('enabled') == 'true':
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  [ -n "$xy" ] || return 1
  echo "tap '$1' at $xy"
  # shellcheck disable=SC2086
  adb shell input tap $xy
}

screen_texts() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/screen.xml" > /dev/null 2>&1 || true
  grep -oE 'text="[^"]+"' "$OUT/screen.xml" 2>/dev/null | \
    sort -u | xargs
}

chrome_probe() {
  local chrome=com.android.chrome url srv_pid='' f='' i texts vc
  if ! adb shell pm path "$chrome" 2>/dev/null | grep -q package:
  then
    record ui-chrome INFO "Chrome not installed on this image"
    return
  fi
  if [ -n "$OLD" ]; then
    reset_pkg
    adb install "$OLD" > /dev/null 2>&1
  fi
  url=${APK_URL:-}
  if [ -z "$url" ]; then
    mkdir -p "$OUT/srv"
    cp "$NEW" "$OUT/srv/reactive-bible-local.apk"
    (cd "$OUT/srv" && exec python3 -m http.server 8765) \
      > /dev/null 2>&1 &
    srv_pid=$!
    adb reverse tcp:8765 tcp:8765 > /dev/null
    url=http://localhost:8765/reactive-bible-local.apk
  fi
  echo "Chrome download of $url"
  # Skip Chrome's first-run flow (honoured on userdebug images).
  adb shell "echo '_ --disable-fre --no-default-browser-check" \
    "--no-first-run' > /data/local/tmp/chrome-command-line"
  adb shell am set-debug-app --persistent "$chrome" > /dev/null 2>&1
  adb shell pm grant "$chrome" android.permission.POST_NOTIFICATIONS \
    > /dev/null 2>&1 || true
  # The phone has "install unknown apps" allowed for its browser.
  adb shell appops set "$chrome" REQUEST_INSTALL_PACKAGES allow \
    > /dev/null 2>&1 || true
  adb shell am force-stop "$chrome"
  adb shell "rm -f /sdcard/Download/reactive-bible*"
  adb logcat -c || true
  adb shell am start -a android.intent.action.VIEW -d "$url" \
    -n "$chrome/com.google.android.apps.chrome.Main" > /dev/null
  for i in $(seq 1 40); do
    sleep 3
    f=$(adb shell ls /sdcard/Download/ 2>/dev/null | tr -d '\r' | \
      grep -E '^reactive-bible.*\.apk$' | head -1)
    if [ -n "$f" ] && ! adb shell ls /sdcard/Download/ | \
      grep -q crdownload; then
      break
    fi
    f=''
    tap_text 'download anyway|download|keep|keep anyway|continue' \
      || tap_text 'accept( & continue)?|no thanks|got it|ok' \
      || tap_text 'use without an account|not now|skip' || true
  done
  adb exec-out screencap -p > "$OUT/chrome-download.png" || true
  if [ -z "$f" ]; then
    record ui-chrome INFO "Chrome download not observed: $(screen_texts)"
    [ -n "$srv_pid" ] && kill "$srv_pid"
    return
  fi
  adb pull "/sdcard/Download/$f" "$OUT/chrome-downloaded.apk" \
    > /dev/null
  if cmp -s "$NEW" "$OUT/chrome-downloaded.apk"; then
    record chrome-download PASS "$f identical to tested APK"
  elif [ -n "${APK_URL:-}" ]; then
    record chrome-download FAIL "$f differs from $NEW"
  else
    record chrome-download FAIL "$f differs from served APK"
  fi
  # Open it the way the phone does: Chrome's "Open" action.
  local opened=''
  for i in $(seq 1 5); do
    tap_text 'open' && opened=1 && break
    sleep 2
  done
  if [ -z "$opened" ]; then
    # Snackbar gone: tap Chrome's download-complete notification.
    adb shell cmd statusbar expand-notifications > /dev/null 2>&1
    sleep 2
    tap_text 'reactive-bible.*\.apk' || \
      tap_text '.*download complete.*' || true
  fi
  sleep 6
  adb exec-out screencap -p > "$OUT/ui-chrome.png" || true
  texts=$(screen_texts)
  echo "UI text (chrome): $texts"
  if echo "$texts" | grep -qiE 'problem parsing|parse error'; then
    record ui-chrome FAIL "parse-error dialog: $texts"
  elif tap_text 'update|install'; then
    sleep 15
    tap_text 'done' > /dev/null 2>&1 || true
    vc=$(adb shell dumpsys package "$PKG" | tr -d '\r' | \
      sed -n 's/.*versionCode=\([0-9]*\).*/\1/p' | head -1)
    if [ "$vc" = "$NEW_VC" ]; then
      record ui-chrome PASS "installer updated app to $vc"
    else
      record ui-chrome FAIL \
        "after installer: versionCode=$vc (want $NEW_VC)"
      screen_texts
    fi
  else
    record ui-chrome INFO "installer not reached: $texts"
  fi
  adb logcat -d > "$OUT/logcat-ui-chrome.txt" || true
  [ -n "$srv_pid" ] && kill "$srv_pid"
  adb shell rm -f /data/local/tmp/chrome-command-line
}

adb logcat -c || true

# --- fresh install ---------------------------------------------------
reset_pkg
check_install fresh adb install "$NEW"
installed_version

# --- in-place update from an older signed build -----------------------
if [ -n "$OLD" ]; then
  reset_pkg
  check_install old-baseline adb install "$OLD"
  echo "Baseline: $(installed_version)"
  check_install update adb install -r "$NEW"
  echo "Updated: $(installed_version)"

  reset_pkg
  adb install "$OLD" > /dev/null 2>&1
  adb push "$NEW" /data/local/tmp/new.apk > /dev/null
  check_install pm-update adb shell pm install -r /data/local/tmp/new.apk
fi

# --- the updated app launches ----------------------------------------
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 \
  > /dev/null 2>&1
sleep 8
PID=$(adb shell pidof "$PKG" | tr -d '\r')
adb exec-out screencap -p > "$OUT/app-launch.png" || true
if [ -n "$PID" ]; then
  record launch PASS "pid $PID"
else
  record launch FAIL "process not running after launch"
fi
adb shell am force-stop "$PKG" || true

# --- PackageInstaller UI path (tap the downloaded APK) ----------------
# Feed the system installer the file the way a file manager / the
# browser's download notification does. Its own parse runs before
# any install prompt, so the parse-error dialog shows here if the
# platform cannot read the APK.
if [ -n "$OLD" ]; then
  reset_pkg
  adb install "$OLD" > /dev/null 2>&1
fi
DL=/sdcard/Download/reactive-bible-test.apk
adb push "$NEW" "$DL" > /dev/null
# Shell is the "source" app; allow it to request installs so the
# unknown-sources gate does not hide the installer's own result.
adb shell appops set com.android.shell REQUEST_INSTALL_PACKAGES \
  allow > /dev/null 2>&1 || true

ui_probe() { # label uri
  local label=$1 uri=$2 xml="$OUT/ui-$1.xml"
  adb shell input keyevent KEYCODE_HOME
  adb logcat -c || true
  adb shell am start -W -a android.intent.action.VIEW \
    -d "$uri" -t application/vnd.android.package-archive \
    --grant-read-uri-permission 2>&1 | tr -d '\r'
  sleep 6
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$xml" > /dev/null 2>&1 || : > "$xml"
  adb exec-out screencap -p > "$OUT/ui-$label.png" || true
  adb logcat -d > "$OUT/logcat-ui-$label.txt" || true
  local texts
  texts=$(grep -oE 'text="[^"]+"' "$xml" | sort -u | xargs)
  echo "UI text ($label): $texts"
  if echo "$texts" | grep -qiE 'problem parsing|parse error'; then
    record "ui-install-$label" FAIL "parse-error dialog: $texts"
  elif echo "$texts" | grep -qiE 'install|update'; then
    record "ui-install-$label" PASS "$texts"
  else
    record "ui-install-$label" INFO "no installer UI: $texts"
  fi
}

ui_probe file "file://$DL"

# content:// via MediaStore, closer to what Chrome / Files hand over.
adb shell am broadcast \
  -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d "file://$DL" > /dev/null 2>&1 || true
sleep 3
DATA=/storage/emulated/0/Download/reactive-bible-test.apk
ID=$(adb shell content query --uri content://media/external/file \
  --projection _id --where "_data=\'$DATA\'" 2>/dev/null \
  | tr -d '\r' | grep -oE '_id=[0-9]+' | head -1 | cut -d= -f2)
if [ -n "$ID" ]; then
  ui_probe content "content://media/external/file/$ID"
else
  record ui-install-content INFO "file not found in MediaStore"
fi

adb shell input keyevent KEYCODE_HOME

# --- Browser download path (what the in-app "Update" button does) -----
# The updater hands apkUrl to the system browser. Drive Chrome to
# download the APK ($APK_URL, else a local server via adb reverse),
# check the downloaded bytes, open it from Chrome and let the
# installer finish the update. Skipped (INFO) on images without
# Chrome.
NEW_VC=$(aapt_badging "$NEW" | \
  sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p")
chrome_probe
adb shell input keyevent KEYCODE_HOME

# --- logs --------------------------------------------------------------
adb logcat -d > "$OUT/logcat.txt" || true
PAT='PackageInstaller|PackageParser|PackageManager|INSTALL_'
PAT="$PAT|InstallStart|parse"
cat "$OUT"/logcat*.txt | grep -E "$PAT" \
  > "$OUT/installer-filtered.txt" || true
grep -E 'INSTALL_(PARSE_)?FAILED_[A-Z_]+|problem parsing' \
  "$OUT/installer-filtered.txt" | sort -u | head -40 || true

echo "---- summary ----"
cat "$OUT/results.txt"
exit "$FAIL"
