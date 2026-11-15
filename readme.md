# DNS Resolution Checker

A Flask web dashboard that checks whether private domain names (such as
`router.lan` or `nas.home.lan`) resolve to an IP address on your network.

## Features
- Resolve any domain and see the IP, latency, and OK/FAIL result
- Watchlist of domains with one-click checks and "Check all"
- Success rate, counts, and average latency cards
- Analysis page with success bars and latency per domain
- Dark UI with an amber accent

## Setup (VS Code / Windows)

1. Open the `DNS_RESOLUTION` folder in VS Code.
2. Open a terminal and create a virtual environment:
```bash
   python -m venv venv
   venv\Scripts\activate
```
3. Install the requirements:
```bash
   pip install -r requirements.txt
```
4. Run the app:
```bash
   python app.py
```
5.Open http://127.0.0.1:5001 in your browser.

## How it works
- `app.py` runs the Flask server and the DNS lookups using `socket.gethostbyname`,
  which uses your computer's normal DNS resolver. Names your router or Pi-hole
  knows will resolve here.
- `templates/index.html` is the page layout.
- `static/style.css` holds the theme.
- `static/script.js` calls the API and updates the page without reloading.

## Demo tips
- Success: Check google.com or cloudflare.com.
- Failure: Check this-domain-should-not-exist.invalid.
- Use Check all to test all domains in the watchlist.

## Notes
- Data is kept in memory, so the watchlist and history reset when the server restarts.
- Lookups time out after 3 seconds (set in `app.py`).
- The ESP32 hardware can be added later: the device can call `/api/resolve`
  and the same LED states can drive the physical LEDs.