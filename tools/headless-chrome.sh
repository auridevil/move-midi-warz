#!/bin/sh
# Headless Chrome for tests and reviews, SILENT: audio is processed (AudioContext, exports, timing all work) but never
# reaches the speakers, so test runs don't play drums into your calls. Every scripted Chrome must start through this
# (or orbit2/tools/cdp.mjs, which uses the same flags). Never launch Chrome directly, never play audio with afplay/open.
#
#   tools/headless-chrome.sh 9222 &          # debug port (default 9222); profile in /tmp/mw-chrome-<port>
#   node tools/smoke.mjs http://localhost:5400
#   pkill -f "remote-debugging-port=9222"; rm -rf /tmp/mw-chrome-9222
port="${1:-9222}"
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port="$port" \
  --user-data-dir="/tmp/mw-chrome-$port" --mute-audio --disable-audio-output --autoplay-policy=no-user-gesture-required \
  --no-first-run about:blank
