#!/usr/bin/env node
/*
 * gen_terminal.js — build the public "Market Mode" data files from the xv31 engine output.
 *
 * POINT-IN-TIME RECORD: every nightly run recomputes its whole trailing window, so older
 * dates in a newer run can differ from what the engine actually said on that day. For the
 * public record we take, from each run folder, ONLY the row whose date == that run's
 * analysis_end (the engine's call that day). If several runs share an analysis_end, the one
 * generated last wins. A day with no run is left as a gap — never backfilled.
 *
 * Reads ONLY derived CSV output (never engine code). Emits only: date, mode, safety mode and
 * basket totals / holdings. Reason codes, trigger values, thresholds and lookbacks are never
 * read into the output.
 *
 * Outputs (all written only after every check passes):
 *   <sandbox>/market-mode/data/current.json
 *   <sandbox>/market-mode/data/mode_history.json
 *   <sandbox>/market-mode/data/mode_changes.json
 *   <sandbox>/market-mode/data/btc_daily.json      (grows over time; never truncated)
 *   <sandbox>/proofs/<as_of>.txt                 (SHA-256 of each file above)
 *
 * BTC/USD: CoinGecko daily price (00:00 UTC), fetched here, server-side. The demo API key is
 * read from env COINGECKO_DEMO_API_KEY (set by the engine runner) and never written anywhere.
 *
 * Exit codes: 0 ok · 1 validation / fetch failure (nothing written).
 * Usage: node tools/gen_terminal.js
 * Env:   BC25_ENGINE_OUT (engine output dir) · BC25_RECORD_START (default 2026-07-25)
 *        BC25_BTC_SKIP_FETCH=1 (dev/testing only: reuse the existing btc_daily.json)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const ENGINE_OUT = process.env.BC25_ENGINE_OUT ||
  "C:/Users/elite/OneDrive/Desktop/crypto_index/xv31_paper_main_output";
const SANDBOX = path.join(__dirname, "..");
const DATA_DIR = path.join(SANDBOX, "market-mode", "data");
const PROOF_DIR = path.join(SANDBOX, "proofs");
const RECORD_START = process.env.BC25_RECORD_START || "2026-07-25";   // confirmed by Brett: xv31 only

const REGIMES = ["strong_risk_on", "risk_on", "neutral", "staged_recovery", "risk_off", "bear_preservation"];
const SAFETY = ["normal", "safe", "degraded", "freeze", "emergency"];
const DEFENSIVE = ["pax-gold", "tether", "usd-coin", "dai"];
const LEADERS = ["bitcoin", "ethereum", "solana"];
const NOT_COIN = { date: 1, weights_sum: 1, rotating_weight_total: 1 };
const LABEL = {
  bitcoin:"BTC", ethereum:"ETH", solana:"SOL", "pax-gold":"PAXG", tether:"USDT", "usd-coin":"USDC", dai:"DAI",
  "avalanche-2":"AVAX", binancecoin:"BNB", cardano:"ADA", chainlink:"LINK", dogecoin:"DOGE", "hedera-hashgraph":"HBAR",
  hyperliquid:"HYPE", litecoin:"LTC", monero:"XMR", ripple:"XRP", stellar:"XLM", sui:"SUI", tron:"TRX", zcash:"ZEC",
  "tether-gold":"XAUT", "bitcoin-cash":"BCH", polkadot:"DOT", near:"NEAR", aptos:"APT", "the-open-network":"TON",
  mantle:"MNT", "crypto-com-chain":"CRO"
};

function die(msg) { console.error("gen_terminal: ERROR: " + msg); process.exit(1); }
function log(msg) { console.log("gen_terminal: " + msg); }
function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// tolerant ISO date: accepts YYYY-MM-DD[...] and M/D/YYYY
function isoDate(s) {
  s = String(s || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
  return null;
}
function readCsv(fp) {
  const txt = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
  const lines = txt.split(/\r?\n/).filter(l => l.length);
  const header = lines[0].split(",");
  return { header, rows: lines.slice(1).map(l => l.split(",")) };
}
function rowFor(csv, date, fp) {
  const iDate = csv.header.indexOf("date");
  if (iDate < 0) die("no 'date' column in " + fp);
  const r = csv.rows.find(x => isoDate(x[iDate]) === date);
  if (!r) die("no row for " + date + " in " + fp);
  const o = {}; csv.header.forEach((h, i) => { o[h] = r[i]; }); return o;
}
function need(csv, cols, fp) { cols.forEach(c => { if (csv.header.indexOf(c) < 0) die("missing column '" + c + "' in " + fp); }); }
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

// ---------- 1) pick one run per analysis_end (latest generated wins) ----------
if (!fs.existsSync(ENGINE_OUT)) die("engine output dir not found: " + ENGINE_OUT);
const todayUtc = new Date().toISOString().slice(0, 10);
const runs = fs.readdirSync(ENGINE_OUT).filter(d => /^\d{8}_\d{6}$/.test(d)).sort();
const byEnd = new Map();
for (const r of runs) {
  const man = path.join(ENGINE_OUT, r, "run_manifest.csv");
  if (!fs.existsSync(man)) { log("skip " + r + " (no run_manifest.csv)"); continue; }
  const m = readCsv(man); need(m, ["generated_at_utc", "analysis_end"], man);
  const row = {}; m.header.forEach((h, i) => { row[h] = (m.rows[0] || [])[i]; });
  const end = isoDate(row.analysis_end);
  if (!end) die("bad analysis_end '" + row.analysis_end + "' in " + man);
  if (end < RECORD_START) continue;
  if (end > todayUtc) die("future analysis_end " + end + " in " + man);
  const gen = String(row.generated_at_utc || "");
  const prev = byEnd.get(end);
  if (!prev || gen > prev.gen) byEnd.set(end, { run: r, gen });
}
const dates = [...byEnd.keys()].sort();
if (!dates.length) die("no runs on/after " + RECORD_START);

// ---------- 2) point-in-time rows ----------
const history = [];
const latestWeights = {};
for (const d of dates) {
  const { run } = byEnd.get(d), dir = path.join(ENGINE_OUT, run);
  const fR = path.join(dir, "daily_regimes.csv"), fS = path.join(dir, "daily_safety_modes.csv"), fW = path.join(dir, "daily_weights.csv");
  [fR, fS, fW].forEach(f => { if (!fs.existsSync(f)) die("missing " + f); });
  const cR = readCsv(fR), cS = readCsv(fS), cW = readCsv(fW);
  need(cR, ["date", "regime"], fR); need(cS, ["date", "safety_mode"], fS);
  need(cW, ["date", "weights_sum", "rotating_weight_total"].concat(LEADERS, DEFENSIVE), fW);
  const rR = rowFor(cR, d, fR), rS = rowFor(cS, d, fS), rW = rowFor(cW, d, fW);
  const regime = rR.regime, safety = rS.safety_mode;
  if (REGIMES.indexOf(regime) < 0) die("unknown regime '" + regime + "' on " + d + " (" + run + ")");
  if (SAFETY.indexOf(safety) < 0) die("unknown safety mode '" + safety + "' on " + d + " (" + run + ")");
  const num = k => { const v = parseFloat(rW[k]); return isFinite(v) ? v : 0; };
  const wsum = num("weights_sum");
  if (Math.abs(wsum - 1) > 0.005) die("weights_sum " + wsum + " on " + d + " (" + run + ")");
  const def = DEFENSIVE.reduce((a, k) => a + num(k), 0), lead = LEADERS.reduce((a, k) => a + num(k), 0), alts = num("rotating_weight_total");
  if (Math.abs(def + lead + alts - wsum) > 0.005) die("baskets don't add up on " + d + " (" + run + "): " + (def + lead + alts));
  history.push({ date: d, regime, safety_mode: safety,
    defensive_pct: round(def * 100, 2), leaders_pct: round(lead * 100, 2), alts_pct: round(alts * 100, 2) });
  if (d === dates[dates.length - 1]) {
    cW.header.forEach(h => { if (!NOT_COIN[h]) { const v = num(h); if (v > 0) latestWeights[h] = v; } });
  }
}
log("point-in-time days: " + history.length + " (" + dates[0] + " -> " + dates[dates.length - 1] + "), gaps: " +
    (daysBetween(dates[0], dates[dates.length - 1]) + 1 - dates.length));

// ---------- 3) BTC/USD daily (CoinGecko, 00:00 UTC) ----------
function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({ "accept": "application/json", "user-agent": "bc25-terminal-job" }, headers) }, res => {
      let b = ""; res.on("data", c => b += c);
      res.on("end", () => { if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode)); try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
const BTC_FP = path.join(DATA_DIR, "btc_daily.json");
async function btcSeries() {
  const have = new Map();
  if (fs.existsSync(BTC_FP)) JSON.parse(fs.readFileSync(BTC_FP, "utf8")).forEach(p => have.set(p.date, p.close));
  if (process.env.BC25_BTC_SKIP_FETCH === "1") { log("WARNING: BTC fetch skipped (dev mode)"); }
  else {
    const key = process.env.COINGECKO_DEMO_API_KEY;
    if (!key) throw new Error("COINGECKO_DEMO_API_KEY not set");
    const j = await getJson("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily",
                            { "x-cg-demo-api-key": key });
    if (!j || !Array.isArray(j.prices) || j.prices.length < 30) throw new Error("unexpected CoinGecko response");
    let n = 0;
    for (const [ms, px] of j.prices) {
      if (ms % 86400000 !== 0 || !(px > 0)) continue;              // keep only the 00:00 UTC daily points
      have.set(new Date(ms).toISOString().slice(0, 10), round(px, 2)); n++;
    }
    log("BTC daily points fetched: " + n);
  }
  const out = [...have.entries()].filter(([d]) => d <= todayUtc).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, close]) => ({ date, close }));
  if (!out.length) throw new Error("no BTC data");
  return out;
}

(async () => {
  let btc;
  try { btc = await btcSeries(); } catch (e) { die("BTC price fetch failed: " + e.message + " (Market Mode data left at previous day)"); }
  const btcMap = new Map(btc.map(p => [p.date, p.close]));
  const last = history[history.length - 1];
  if (!btcMap.has(last.date)) log("WARNING: no BTC price for as-of date " + last.date);

  // ---------- 4) derived files ----------
  const changes = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].regime !== history[i - 1].regime)
      changes.push({ date: history[i].date, from: history[i - 1].regime, to: history[i].regime, btc_price: btcMap.has(history[i].date) ? btcMap.get(history[i].date) : null });
  }
  let since = last.date;
  for (let i = history.length - 1; i >= 0 && history[i].regime === last.regime; i--) since = history[i].date;
  const top = Object.entries(latestWeights).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([id, w]) => ({ asset: LABEL[id] || id.toUpperCase(), id, pct: round(w * 100, 2) }));
  const current = {
    as_of_date: last.date,
    generated_at_utc: byEnd.get(last.date).gen,
    regime: last.regime,
    regime_since: since,
    days_in_regime: daysBetween(since, last.date) + 1,
    safety_mode: last.safety_mode,
    baskets: { defensive_pct: last.defensive_pct, leaders_pct: last.leaders_pct, alts_pct: last.alts_pct },
    top_holdings: top,
    record_start: history[0].date,
    btc_source: "CoinGecko BTC/USD daily price (00:00 UTC)"
  };

  // ---------- 5) final validation, then write everything ----------
  const allDates = history.map(h => h.date);
  if (allDates.some((d, i) => i && d <= allDates[i - 1])) die("mode_history dates not strictly increasing");
  if (allDates.some(d => d > todayUtc) || btc.some(p => p.date > todayUtc)) die("future dates in output");
  const files = {
    "current.json": JSON.stringify(current, null, 1),
    "mode_history.json": JSON.stringify(history),
    "mode_changes.json": JSON.stringify(changes),
    "btc_daily.json": JSON.stringify(btc)
  };
  fs.mkdirSync(DATA_DIR, { recursive: true }); fs.mkdirSync(PROOF_DIR, { recursive: true });
  const proof = ["BC25 Market Mode data — SHA-256 of each published file", "as_of " + current.as_of_date + " · generated_at_utc " + current.generated_at_utc, ""];
  for (const [name, body] of Object.entries(files)) {
    const tmp = path.join(DATA_DIR, name + ".tmp");
    fs.writeFileSync(tmp, body); fs.renameSync(tmp, path.join(DATA_DIR, name));
    proof.push(crypto.createHash("sha256").update(body).digest("hex") + "  market-mode/data/" + name);
  }
  fs.writeFileSync(path.join(PROOF_DIR, current.as_of_date + ".txt"), proof.join("\n") + "\n");
  log("wrote current/mode_history/mode_changes/btc_daily + proofs/" + current.as_of_date + ".txt  mode=" + current.regime +
      " since " + since + "  changes=" + changes.length);
})();
