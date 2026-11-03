#!/usr/bin/env node
/*
 * gen_stageb.js — regenerate BC25_Sandbox/stageb.json from the newest xv31 Stage B run.
 *
 * Reads ONLY the engine's derived CSV output (never engine code) and emits the small
 * derived JSON the public sandbox fetches. Dependency-free (Node stdlib).
 *
 * Source:  <engineOut>/<newest YYYYMMDD_HHMMSS>/  (nav_comparison.csv, daily_weights.csv, daily_regimes.csv)
 *   engineOut defaults to the local engine output dir; override with env BC25_ENGINE_OUT.
 * Output:  ../stageb.json  (override with argv[2])
 *
 * Usage:   node tools/gen_stageb.js [outPath]
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ENGINE_OUT = process.env.BC25_ENGINE_OUT ||
  "C:/Users/elite/OneDrive/Desktop/crypto_index/xv31_paper_main_output";
const OUT = process.argv[2] || path.join(__dirname, "..", "stageb.json");

// coin id -> display ticker (fallback: UPPERCASE id)
const LABEL = {
  bitcoin:"BTC", ethereum:"ETH", solana:"SOL", "pax-gold":"PAXG", tether:"USDT",
  "usd-coin":"USDC", dai:"DAI", "avalanche-2":"AVAX", binancecoin:"BNB", cardano:"ADA",
  chainlink:"LINK", dogecoin:"DOGE", "hedera-hashgraph":"HBAR", hyperliquid:"HYPE",
  litecoin:"LTC", monero:"XMR", ripple:"XRP", stellar:"XLM", sui:"SUI", tron:"TRX",
  zcash:"ZEC", "tether-gold":"XAUT", "bitcoin-cash":"BCH", polkadot:"DOT", near:"NEAR",
  aptos:"APT", "the-open-network":"TON", mantle:"MNT", "crypto-com-chain":"CRO"
};
const NOT_COIN = { weights_sum:1, rotating_weight_total:1, date:1 };
const STATES = ["neutral","risk_on","strong_risk_on","risk_off","bear_preservation","staged_recovery"];
const MODES  = ["normal","safe","degraded","freeze","emergency"];

function die(msg){ console.error("gen_stageb: " + msg); process.exit(1); }
function readCsv(fp){
  const txt = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
  const rows = txt.split(/\r?\n/).filter(l => l.length).map(l => l.split(","));
  return { header: rows[0], rows: rows.slice(1) };
}
function round(n, d){ const f = Math.pow(10, d); return Math.round(n * f) / f; }

// --- locate newest dated run folder ---
if (!fs.existsSync(ENGINE_OUT)) die("engine output dir not found: " + ENGINE_OUT + " (set BC25_ENGINE_OUT)");
const dated = fs.readdirSync(ENGINE_OUT)
  .filter(d => /^\d{8}_\d{6}$/.test(d) && fs.statSync(path.join(ENGINE_OUT, d)).isDirectory())
  .sort();
if (!dated.length) die("no dated run folders in " + ENGINE_OUT);
const RUN = path.join(ENGINE_OUT, dated[dated.length - 1]);
const navFp = path.join(RUN, "nav_comparison.csv");
const wFp   = path.join(RUN, "daily_weights.csv");
const rFp   = path.join(RUN, "daily_regimes.csv");
[navFp, wFp, rFp].forEach(fp => { if (!fs.existsSync(fp)) die("missing " + fp); });

// --- series from nav_comparison.csv (forward-fill any blank benchmark cells) ---
const nav = readCsv(navFp); // date,INDEX,BTC,ETH,SOL
const series = { date:[], index:[], btc:[], eth:[], sol:[] };
const cols = [["index",1],["btc",2],["eth",3],["sol",4]];
const last = { index:null, btc:null, eth:null, sol:null };
for (const r of nav.rows){
  if (!r[0]) continue;
  series.date.push(r[0]);
  for (const [k, i] of cols){
    let v = parseFloat(r[i]);
    if (!isFinite(v)) v = last[k];            // forward-fill gaps
    if (v == null) v = last[k];
    last[k] = v;
    series[k].push(v == null ? null : round(v, 4));
  }
}
if (series.date.length < 2) die("series too short (" + series.date.length + " rows)");

// --- fixed-anchor NAV ledger (stops the rolling-window rebase drift) ---
// The engine rebases its INDEX to 100 at the START of a trailing window that
// rolls forward every night, so the same calendar date's absolute NAV shifted
// run-to-run even when the basket didn't move (a minter would see fake
// overnight gains/losses). We keep a persistent per-date NAV ledger updated
// ONLY by the real daily return (which is base-invariant), so a given date's
// NAV never changes once written and mint/redeem is reproducible.
//   - First seed (or BC25_NAV_REANCHOR=1): anchor the LATEST date to $1.00 and
//     scale the whole visible window uniformly (uniform scale preserves every
//     real daily return), then freeze it.
//   - Later runs: only NEW dates are appended, chaining the real daily return
//     onto the prior day's frozen NAV. Existing dates stay frozen.
const LEDGER_FP = process.env.BC25_NAV_LEDGER || path.join(__dirname, "..", "nav_ledger.json");
const REANCHOR = process.env.BC25_NAV_REANCHOR === "1";
let ledger = {};
try { ledger = JSON.parse(fs.readFileSync(LEDGER_FP, "utf8")); } catch (e) { ledger = {}; }
const dts = series.date, idx = series.index;
const haveLedger = ledger && Object.keys(ledger).length > 0;
if (!haveLedger || REANCHOR) {
  const k = 1.0 / (idx[idx.length - 1] / 100);   // anchor latest date to $1.00
  ledger = {};
  for (let i = 0; i < dts.length; i++) ledger[dts[i]] = round((idx[i] / 100) * k, 6);
} else {
  for (let i = 0; i < dts.length; i++) {
    const d = dts[i];
    if (ledger[d] != null) continue;             // already frozen — never change it
    let prevNav = null, prevIdx = null;          // chain the real daily return forward
    for (let j = i - 1; j >= 0; j--) { if (ledger[dts[j]] != null) { prevNav = ledger[dts[j]]; prevIdx = idx[j]; break; } }
    ledger[d] = (prevNav != null && isFinite(prevIdx) && prevIdx !== 0)
      ? round(prevNav * (idx[i] / prevIdx), 6)
      : round(idx[i] / 100, 6);                   // fallback (no overlap to chain from)
  }
}
fs.writeFileSync(LEDGER_FP, JSON.stringify(ledger));
// Replace the window-relative index with the fixed-anchor NAV (x100 so the
// frontend's idx/100 and the chart's self-rebasing both keep working unchanged).
series.index = dts.map(d => round(ledger[d] * 100, 4));

// --- weights from the LAST row of daily_weights.csv ---
const w = readCsv(wFp);
const wLast = w.rows[w.rows.length - 1];
let weights = [];
for (let i = 1; i < w.header.length; i++){
  const id = w.header[i];
  if (NOT_COIN[id]) continue;
  const val = parseFloat(wLast[i]);
  if (isFinite(val) && val > 0.0005){
    weights.push({ id, label: LABEL[id] || id.toUpperCase().slice(0,5), w: round(val * 100, 1) });
  }
}
weights.sort((a, b) => b.w - a.w);

// --- regime (state/mode/defw per day), aligned to the series dates ---
const reg = readCsv(rFp);
const H = reg.header;
const ci = name => H.indexOf(name);
const cRegime = ci("regime"), cMode = ci("safety_mode"), cDefw = ci("defensive_weight_total");
if (cRegime < 0 || cMode < 0 || cDefw < 0) die("daily_regimes.csv missing a required column");
const byDate = {};
for (const r of reg.rows){ if (r[0]) byDate[r[0]] = r; }
const regime = { states: STATES, modes: MODES, state: [], mode: [], defw: [] };
let prev = { st: 0, md: 0, dw: 0 };
for (const d of series.date){
  const r = byDate[d];
  let cur = prev;
  if (r){
    let st = STATES.indexOf(r[cRegime]); if (st < 0) st = prev.st;
    let md = MODES.indexOf(r[cMode]);    if (md < 0) md = prev.md;
    let dw = parseFloat(r[cDefw]);       if (!isFinite(dw)) dw = prev.dw;
    cur = { st, md, dw: round(dw, 4) };
  }
  regime.state.push(cur.st);
  regime.mode.push(cur.md);
  regime.defw.push(cur.dw);
  prev = cur;
}

const out = {
  asof: series.date[series.date.length - 1],
  start: series.date[0],
  days: series.date.length,
  note: "BC25 Stage B paper-test, trailing " + series.date.length + "d. Index = BC25 NAV x100, fixed-anchor ($1.00 at re-anchor date, chained by real daily returns) — stable across runs.",
  series, weights, regime
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("gen_stageb: wrote " + OUT);
console.log("  run=" + dated[dated.length - 1] + "  start=" + out.start + "  asof=" + out.asof +
            "  days=" + out.days + "  weights=" + weights.length +
            "  top=" + weights.slice(0,3).map(x => x.label + " " + x.w + "%").join(", "));
