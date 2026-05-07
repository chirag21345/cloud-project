#!/bin/sh
set -e

# unit-style check
php -r 'require "src/functions.inc.php"; $n = getTotalIPs("1.1.1.1,2.2.2.2,"); if ($n !== 3) { echo "Expected 3, got $n\n"; exit(1);}';

# simple HTTP check against built-in server
php -S 0.0.0.0:8000 -t src >/tmp/php-totalips.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
i=0
until php -r 'echo @file_get_contents("http://localhost:8000/?items=x") ? "ok" : "";' | grep -q ok; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then echo "server never came up"; exit 1; fi
  sleep 0.2
done
php -r '$j=json_decode(file_get_contents("http://localhost:8000/?items=1.1.1.1,,"),true); if(!$j || $j["total_ips"]!==3){exit(1);}';
