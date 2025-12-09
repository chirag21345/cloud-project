import os
import threading
import time
import smtplib
from email.message import EmailMessage
from dataclasses import dataclass, asdict
import random

import requests
from flask import Flask, jsonify

BASE_URL = os.getenv("BASE_URL", "http://localhost:8090")
INTERVAL = int(os.getenv("MONITOR_INTERVAL", "0"))
ALERT_URL = os.getenv("ALERT_URL", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "")
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "")

app = Flask(__name__)
last_result = {"status": "not_run", "checks": [], "timestamp": None}


def is_ipv4(ip: str) -> bool:
    parts = ip.split(".")
    return len(parts) == 4 and all(p != "" for p in parts)


def is_ipv6(ip: str) -> bool:
    parts = ip.split(":")
    return 2 <= len(parts) <= 8


def country_for(ip: str) -> str:
    if "." in ip and len(ip.split(".")) == 4:
        code = ip[:3]
        if code == "100":
            return "US"
        if code == "101":
            return "UK"
        if code == "102":
            return "China"
    return "Unknown"


def is_bad(ip: str) -> bool:
    bad_list = {
        "100.200.300.400",
        "101.201.301.401",
        "102.202.302.402",
        "103.203.303.403",
    }
    return ip in bad_list


@dataclass
class CheckResult:
    name: str
    ok: bool
    duration_ms: int
    detail: str = ""


def run_checks():
    def rand_ipv4():
        return ".".join(str(random.randint(1, 254)) for _ in range(4))

    def rand_ipv6():
        groups = random.randint(2, 8)
        return ":".join("x" for _ in range(groups))

    def rand_invalid():
        return f"{random.randint(1,999)}..bad"

    base = [
        "172.217.23.206",
        "1.21.23.206",
        "",
        "172.217.23.206.100",
        "2:145:40",
        "100.200.300.400",
        "101.201.301.401",
        "102.202.302.402",
        "103.203.303.403",
        "100.217.23.206",
    ]
    random_block = [
        rand_ipv4(),
        rand_ipv4(),
        rand_ipv6(),
        rand_ipv6(),
        rand_invalid(),
        "",
    ]
    items_list = base + random_block
    items = ",".join(items_list)

    expected_total = len(items_list)
    expected_empty = sum(1 for i in items_list if i == "")

    valid = [i for i in items_list if i and (is_ipv4(i) or is_ipv6(i))]
    invalid = [i for i in items_list if not (i and (is_ipv4(i) or is_ipv6(i)))]

    expected_ipv4 = [i for i in items_list if i and is_ipv4(i)]
    expected_ipv6 = [i for i in items_list if i and is_ipv6(i) and not is_ipv4(i)]

    expected_country = [{ "ip": i, "country": country_for(i)} for i in items_list if i]

    expected_bad = [{"ip": i, "status": "Bad IP" if is_bad(i) else "Good IP"} for i in items_list if i]
    expected_bad_total = sum(1 for e in expected_bad if e["status"] == "Bad IP")

    checks = []

    def call(name, path, expect_fn):
        start = time.time()
        try:
            resp = requests.get(f"{BASE_URL}{path}", timeout=4)
            dur = int((time.time() - start) * 1000)
            if resp.status_code != 200:
                checks.append(CheckResult(name, False, dur, f"status {resp.status_code}"))
                return
            data = resp.json()
            ok, detail = expect_fn(data)
            checks.append(CheckResult(name, ok, dur, detail))
        except Exception as e:
            dur = int((time.time() - start) * 1000)
            checks.append(CheckResult(name, False, dur, str(e)))

    call("total_ips", f"/totalips?items={items}", lambda d: (d.get("total_ips") == expected_total, f"got {d.get('total_ips')}"))
    call("total_empty_ips", f"/totalemptyips?items={items}", lambda d: (d.get("total_empty_ips") == expected_empty, f"got {d.get('total_empty_ips')}"))
    call("total_valid_ips", f"/totalvalid?items={items}", lambda d: (d.get("total_valid_ips") == len(valid) and set(d.get("invalid_ips", [])) == set(invalid), ""))
    call("classify", f"/classify?items={items}", lambda d: (set(d.get("ipv4", [])) == set(expected_ipv4) and set(d.get("ipv6", [])) == set(expected_ipv6), ""))
    call("country", f"/country?items={items}", lambda d: (d.get("results", []) == expected_country, ""))
    call("badips", f"/badips?items={items}", lambda d: (d.get("total_bad_ips") == expected_bad_total, ""))

    summary_checks = []
    for c in checks:
        d = asdict(c)
        d["ok_numeric"] = 1 if c.ok else 0
        summary_checks.append(d)

    summary = {
        "status": "ok" if all(c.ok for c in checks) else "fail",
        "timestamp": int(time.time()),
        "checks": summary_checks,
    }
    if summary["status"] != "ok":
        send_alert_email(summary)
    return summary


def periodic_runner():
    global last_result
    while True:
        last_result = run_checks()
        if ALERT_URL and last_result["status"] != "ok":
            try:
                requests.post(ALERT_URL, json=last_result, timeout=3)
            except Exception:
                pass
        time.sleep(max(INTERVAL, 1))


def send_alert_email(result):
    if not (SMTP_HOST and ALERT_EMAIL_FROM and ALERT_EMAIL_TO):
        return
    try:
        msg = EmailMessage()
        msg["From"] = ALERT_EMAIL_FROM
        msg["To"] = ALERT_EMAIL_TO
        msg["Subject"] = "IPChecker monitor failure"
        body_lines = [f"Status: {result['status']}", "Checks:"]
        for c in result["checks"]:
            body_lines.append(f"- {c['name']}: ok={c['ok']} dur={c['duration_ms']}ms detail={c['detail']}")
        msg.set_content("\n".join(body_lines))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as s:
            try:
                s.starttls()
            except Exception:
                pass
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    except Exception:
        pass


@app.route("/run", methods=["GET"])
def run_now():
    global last_result
    last_result = run_checks()
    return jsonify(last_result)


@app.route("/last", methods=["GET"])
def last():
    return jsonify(last_result)


@app.route("/metrics", methods=["GET"])
def metrics():
    global last_result
    if last_result.get("status") in ("not_run", None):
        last_result = run_checks()
    lines = []
    for c in last_result.get("checks", []):
        svc = c.get("name", "")
        ok_val = c.get("ok_numeric", 1 if c.get("ok") else 0)
        dur = c.get("duration_ms", 0)
        lines.append(f'ipchecker_check_ok{{service="{svc}"}} {ok_val}')
        lines.append(f'ipchecker_latency_ms{{service="{svc}"}} {dur}')
    return "\n".join(lines) + "\n", 200, {"Content-Type": "text/plain; version=0.0.4"}

if INTERVAL > 0:
    thread = threading.Thread(target=periodic_runner, daemon=True)
    thread.start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8070)
