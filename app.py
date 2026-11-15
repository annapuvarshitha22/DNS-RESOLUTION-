import socket
import time
from datetime import datetime
from threading import Lock

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# How long to wait for a DNS answer before calling it a failure (seconds)
socket.setdefaulttimeout(3)

lock = Lock()
MAX_HISTORY = 100

# Domains the dashboard checks. Add your own private names here or from the UI.

watchlist = [
    "google.com",
    "cloudflare.com",
    "example.com",
    "this-domain-should-not-exist.invalid"
]
history = []  # newest first


def clean_domain(raw):
    """Keep only letters, digits, dots and hyphens. Lowercase, max 64 chars."""
    d = (raw or "").strip().lower()
    d = "".join(c for c in d if c.isalnum() or c in ".-")
    return d[:64]


def resolve(domain):
    """Ask the system DNS resolver for the domain and log the result."""
    t0 = time.perf_counter()
    try:
        ip = socket.gethostbyname(domain)
        ok = True
    except OSError:  # covers gaierror and timeout
        ip = "-"
        ok = False
    latency = round((time.perf_counter() - t0) * 1000)

    entry = {
        "time": datetime.now().strftime("%H:%M:%S"),
        "domain": domain,
        "ip": ip,
        "latency": latency,
        "ok": ok,
    }
    with lock:
        history.insert(0, entry)
        del history[MAX_HISTORY:]
    return entry


def compute_stats():
    total = len(history)
    ok = sum(1 for h in history if h["ok"])
    good_latencies = [h["latency"] for h in history if h["ok"]]
    return {
        "total": total,
        "ok": ok,
        "fail": total - ok,
        "rate": round(ok / total * 100) if total else 0,
        "avg_latency": round(sum(good_latencies) / len(good_latencies)) if good_latencies else None,
    }


# ---------- Pages ----------
@app.get("/")
def index():
    return render_template("index.html")


# ---------- API ----------
@app.get("/api/state")
def api_state():
    with lock:
        return jsonify({
            "watchlist": watchlist,
            "history": history[:50],
            "stats": compute_stats(),
        })


@app.post("/api/resolve")
def api_resolve():
    data = request.get_json(silent=True) or {}
    domain = clean_domain(data.get("domain"))
    if not domain:
        return jsonify({"error": "Enter a domain name first."}), 400
    return jsonify(resolve(domain))


@app.post("/api/check-all")
def api_check_all():
    results = [resolve(d) for d in list(watchlist)]
    return jsonify({"results": results})


@app.post("/api/watchlist")
def api_add():
    data = request.get_json(silent=True) or {}
    domain = clean_domain(data.get("domain"))
    if not domain:
        return jsonify({"error": "Enter a valid domain name."}), 400
    if domain in watchlist:
        return jsonify({"error": "That domain is already in the watchlist."}), 409
    watchlist.append(domain)
    return jsonify({"ok": True, "domain": domain})


@app.delete("/api/watchlist/<domain>")
def api_remove(domain):
    domain = clean_domain(domain)
    if domain in watchlist:
        watchlist.remove(domain)
    return jsonify({"ok": True})


@app.post("/api/clear")
def api_clear():
    with lock:
        history.clear()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)