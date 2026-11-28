#!/usr/bin/env node
/*
 * pit_diagnostic.js — DEV ONLY. Never published (output is git-ignored).
 *
 * Compares the newest run's re-simulated regime for every past date against the
 * point-in-time record (market-mode/data/mode_history.json) and lists every date where
 * they differ. The public page never uses re-simulated history; this just shows how
 * much the re-simulation drifts from what the engine actually said on the day.
 *
 * Output: tools/pit_diagnostic.csv (git-ignored) + a one-line summary on stdout.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ENGINE_OUT = process.env.BC25_ENGINE_OUT ||
  "C:/Users/elite/OneDrive/Desktop/crypto_index/xv31_paper_main_output";
const HIST = path.join(__dirname, "..", "market-mode", "data", "mode_history.json");
const OUT = path.join(__dirname, "pit_diagnostic.csv");

const runs = fs.readdirSync(ENGINE_OUT).filter(d => /^\d{8}_\d{6}$/.test(d)).sort();
const latest = runs[runs.length - 1];
const txt = fs.readFileSync(path.join(ENGINE_OUT, latest, "daily_regimes.csv"), "utf8").replace(/^\uFEFF/, "");
const lines = txt.split(/\r?\n/).filter(Boolean), h = lines[0].split(","), iD = h.indexOf("date"), iR = h.indexOf("regime");
const resim = new Map(lines.slice(1).map(l => { const c = l.split(","); return [c[iD].slice(0, 10), c[iR]]; }));
const pit = JSON.parse(fs.readFileSync(HIST, "utf8"));
const rows = ["date,point_in_time_regime,latest_run_resimulated_regime"];
let compared = 0;
for (const p of pit) {
  if (!resim.has(p.date)) continue;
  compared++;
  if (resim.get(p.date) !== p.regime) rows.push(p.date + "," + p.regime + "," + resim.get(p.date));
}
fs.writeFileSync(OUT, rows.join("\n") + "\n");
console.log("pit_diagnostic: latest run " + latest + " · compared " + compared + " days · mismatches " + (rows.length - 1) + " -> " + OUT);
