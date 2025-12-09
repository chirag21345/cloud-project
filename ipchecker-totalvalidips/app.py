from flask import Flask, jsonify, request

app = Flask(__name__)


def is_ipv4(ip: str) -> bool:
    parts = ip.split(".")
    # IPv4: exactly 4 non-empty groups separated by dots
    return len(parts) == 4 and all(p != "" for p in parts)


def is_ipv6(ip: str) -> bool:
    parts = ip.split(":")
    # IPv6: between 2 and 8 groups (allow empties for ::)
    return 2 <= len(parts) <= 8


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/", methods=["GET"])
def total_valid():
    items_raw = request.args.get("items", "")

    if items_raw.strip() == "":
        return jsonify({
            "error": True,
            "items": items_raw,
            "total_valid_ips": 0,
            "valid_ips": [],
            "invalid_ips": [],
            "results": [],
            "message": "items parameter is required"
        }), 400

    # Do NOT filter out empties – treat them as invalid entries
    ips = [p.strip() for p in items_raw.split(",")]

    valid = []
    invalid = []
    results = []

    for ip in ips:
        if ip == "":
            invalid.append(ip)
            results.append({"ip": ip, "status": "invalid"})
        elif is_ipv4(ip) or is_ipv6(ip):
            valid.append(ip)
            results.append({"ip": ip, "status": "valid"})
        else:
            invalid.append(ip)
            results.append({"ip": ip, "status": "invalid"})

    return jsonify({
        "error": False,
        "items": items_raw,
        "total_valid_ips": len(valid),
        "valid_ips": valid,
        "invalid_ips": invalid,
        "results": results,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
