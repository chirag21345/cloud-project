#!/bin/sh
set -e

php -r 'require "src/functions.inc.php"; $n = getTotalEmptyIPs("1.1.1.1,,"); if ($n !== 1) { echo "Expected 1, got $n\n"; exit(1);}';

php -S 0.0.0.0:8001 -t src >/tmp/php-totalemptyips.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
i=0
until php -r 'echo @file_get_contents("http://localhost:8001/?items=x") ? "ok" : "";' | grep -q ok; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then echo "server never came up"; exit 1; fi
  sleep 0.2
done
php -r '$j=json_decode(file_get_contents("http://localhost:8001/?items=1.1.1.1,,,"),true); if(!$j || $j["total_empty_ips"]!==2){exit(1);}';
