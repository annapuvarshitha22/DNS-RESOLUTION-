const $ = (id) => document.getElementById(id);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let state = { watchlist: [], history: [], stats: {} };
let busy = false;

// ---------- Helpers ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

let toastTimer;
function toast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

function setLeds(ok) {
  $("ledOk").className = "led" + (ok ? " on-ok" : "");
  $("ledFail").className = "led" + (ok ? "" : " on-fail");
  setTimeout(() => { $("ledOk").className = "led"; $("ledFail").className = "led"; }, 2000);
}

// ---------- Navigation ----------
function showSection(name) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.toggle("active", n.dataset.section === name));
  $("sec-" + name).classList.add("active");
}

document.querySelectorAll(".nav-link").forEach((a) =>
  a.addEventListener("click", () => showSection(a.dataset.section)));

document.querySelectorAll("[data-goto]").forEach((b) =>
  b.addEventListener("click", () => showSection(b.dataset.goto)));

// ---------- Load and render ----------
async function loadState() {
  state = await api("/api/state");
  render();
}

function render() {
  renderStats();
  renderLastResult();
  renderWatchlist();
  renderHistory();
  renderAnalysis();
}

function renderStats() {
  const s = state.stats;
  $("rate").textContent = s.total ? s.rate + "%" : "—";
  $("rateSub").textContent = s.total ? `${s.ok} of ${s.total} checks resolved` : "No checks yet";
  $("total").textContent = s.total;
  $("okCount").textContent = s.ok;
  $("failCount").textContent = s.fail;
  $("avgLat").textContent = s.avg_latency === null ? "—" : s.avg_latency + " ms";
}

function renderLastResult() {
  const last = state.history[0];
  const st = $("status");
  const ip = $("lastIp");
  if (!last) {
    st.textContent = "READY";
    st.className = "status-text muted";
    ip.textContent = "—";
    ip.className = "mono muted";
    return;
  }
  st.textContent = last.ok ? "RESOLVED" : "FAILED";
  st.className = "status-text " + (last.ok ? "ok" : "fail");
  ip.textContent = last.ok ? `${last.domain} → ${last.ip}` : `${last.domain} · no answer`;
  ip.className = "mono " + (last.ok ? "ok" : "fail");
}

function renderWatchlist() {
  const list = state.watchlist;
  const dashRows = list.map((d) => `
    <tr>
      <td class="mono">${esc(d)}</td>
      <td><button class="btn small" data-check="${esc(d)}">Check</button></td>
    </tr>`).join("");
  $("watchRowsDash").innerHTML = dashRows || '<tr><td colspan="2" class="empty">Watchlist is empty</td></tr>';

  const manageRows = list.map((d) => `
    <tr>
      <td class="mono">${esc(d)}</td>
      <td style="text-align:right">
        <button class="btn small" data-check="${esc(d)}">Check</button>
        <button class="btn danger" data-remove="${esc(d)}">Remove</button>
      </td>
    </tr>`).join("");
  $("watchRows").innerHTML = manageRows || '<tr><td colspan="2" class="empty">Watchlist is empty</td></tr>';
}

function renderHistory() {
  const rows = state.history.slice(0, 15).map((h) => `
    <tr>
      <td>${esc(h.time)}</td>
      <td class="mono">${esc(h.domain)}</td>
      <td class="mono">${esc(h.ip)}</td>
      <td>${h.latency} ms</td>
      <td><span class="tag ${h.ok ? "ok" : "fail"}">${h.ok ? "OK" : "FAIL"}</span></td>
    </tr>`).join("");
  $("historyRows").innerHTML = rows || '<tr><td colspan="5" class="empty">No checks yet</td></tr>';
}

function renderAnalysis() {
  const stats = {};
  state.history.forEach((h) => {
    if (!stats[h.domain]) stats[h.domain] = { ok: 0, fail: 0, lat: [] };
    if (h.ok) { stats[h.domain].ok++; stats[h.domain].lat.push(h.latency); }
    else stats[h.domain].fail++;
  });
  const names = Object.keys(stats);

  $("analysisBars").innerHTML = names.length ? names.map((n) => {
    const s = stats[n];
    const total = s.ok + s.fail;
    const okPct = (s.ok / total) * 100;
    const failPct = 100 - okPct;
    return `
      <div class="bar-row">
        <div class="bar-head">
          <span class="mono">${esc(n)}</span>
          <span class="muted">${s.ok} OK · ${s.fail} FAIL</span>
        </div>
        <div class="bar-track">
          <div class="bar-ok" style="width:${okPct}%"></div>
          <div class="bar-fail" style="width:${failPct}%"></div>
        </div>
      </div>`;
  }).join("") : '<div class="empty">Run some checks to see analysis</div>';

  $("latencyRows").innerHTML = names.length ? names.map((n) => {
    const lat = stats[n].lat;
    const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) + " ms" : "—";
    return `<tr><td class="mono">${esc(n)}</td><td>${stats[n].ok + stats[n].fail}</td><td>${avg}</td></tr>`;
  }).join("") : '<tr><td colspan="3" class="empty">No data yet</td></tr>';
}

// ---------- Actions ----------
async function runCheck(domain) {
  if (busy) return;
  busy = true;
  $("resolveBtn").disabled = true;
  $("status").textContent = "CHECKING";
  $("status").className = "status-text wait";
  $("lastIp").textContent = "Resolving " + domain + "...";
  $("lastIp").className = "mono muted";

  try {
    const r = await api("/api/resolve", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
    setLeds(r.ok);
    toast(r.ok
      ? `${r.domain} resolved to ${r.ip} in ${r.latency} ms.`
      : `${r.domain} could not be resolved.`, r.ok ? "ok" : "fail");
    await loadState();
  } catch (e) {
    toast(e.message, "fail");
  } finally {
    busy = false;
    $("resolveBtn").disabled = false;
  }
}

async function checkAll() {
  if (busy) return;
  if (!state.watchlist.length) return toast("Add a domain to the watchlist first.", "info");
  busy = true;
  $("checkAllBtn").disabled = true;
  try {
    const r = await api("/api/check-all", { method: "POST" });
    const failed = r.results.filter((x) => !x.ok).length;
    setLeds(failed === 0);
    toast(`Checked ${r.results.length} domains: ${r.results.length - failed} OK, ${failed} failed.`,
          failed ? "fail" : "ok");
    await loadState();
  } catch (e) {
    toast(e.message, "fail");
  } finally {
    busy = false;
    $("checkAllBtn").disabled = false;
  }
}

async function addDomain(inputId) {
  const input = $(inputId);
  try {
    const r = await api("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ domain: input.value }),
    });
    input.value = "";
    toast(`Added ${r.domain} to the watchlist.`, "ok");
    await loadState();
  } catch (e) {
    toast(e.message, "fail");
  }
}

async function removeDomain(domain) {
  try {
    await api("/api/watchlist/" + encodeURIComponent(domain), { method: "DELETE" });
    toast(`Removed ${domain}.`, "info");
    await loadState();
  } catch (e) {
    toast(e.message, "fail");
  }
}

async function clearHistory() {
  await api("/api/clear", { method: "POST" });
  toast("History cleared.", "info");
  await loadState();
}

// ---------- Event wiring ----------
$("resolveBtn").addEventListener("click", () => {
  const d = $("domainInput").value.trim();
  if (!d) return toast("Enter a domain name first.", "info");
  runCheck(d);
});
$("domainInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("resolveBtn").click();
});

$("checkAllBtn").addEventListener("click", checkAll);
$("clearBtn").addEventListener("click", clearHistory);
$("addBtn").addEventListener("click", () => addDomain("newDomain"));
$("newDomain").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomain("newDomain");
});

// Event delegation for Check / Remove buttons in both tables
document.addEventListener("click", (e) => {
  const check = e.target.closest("[data-check]");
  if (check) return runCheck(check.dataset.check);

  const remove = e.target.closest("[data-remove]");
  if (remove) return removeDomain(remove.dataset.remove);
});

loadState().catch(() => toast("Could not load data. Is the Flask server running?", "fail"));