# BC25 Sandbox — data tools

Keeps the public sandbox's Stage B numbers fresh so the site matches BC25's
actual paper-test track instead of being frozen on an old snapshot.

## What ships vs. what stays private

- **Ships** (committed): `stageb.json` — derived numbers only (rebased NAV + BTC/ETH/SOL
  series, current basket weights, daily regime state/mode/defensive-weight).
- **Never ships**: the xv31 engine (`Desktop/crypto_index`), its CSV output, and its
  CoinGecko key. These tools *read* the engine's derived CSVs and emit the small JSON;
  no engine code is copied into this repo.

## Pieces

| File | Does |
|---|---|
| `gen_stageb.js` | Reads the newest dated run under the engine output dir and writes `../stageb.json`. Node stdlib only. |
| `daily_update.ps1` | Orchestrator: run engine → `gen_stageb.js` → commit+push `stageb.json` if changed. Logs to `daily_update.log`. |

`gen_stageb.js` env/args:
- `BC25_ENGINE_OUT` — engine output dir (default `C:/Users/elite/OneDrive/Desktop/crypto_index/xv31_paper_main_output`).
- `argv[2]` — output path (default `../stageb.json`).

## Run by hand

```
node tools/gen_stageb.js            # just regenerate from the newest existing run
powershell -NoProfile -ExecutionPolicy Bypass -File tools\daily_update.ps1   # full chain
```

## Scheduled task (daily, hands-off)

Registered once with `schtasks` to run the full chain every day:

```
schtasks /Create /TN "BC25 Sandbox Daily Data" ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Users\elite\OneDrive\Documents\BC25_Sandbox\tools\daily_update.ps1\"" ^
  /SC DAILY /ST 21:15 /F
```

Notes:
- Runs **only while the user is logged on** (no stored password). If the machine is off
  or logged out at 21:15, that day is skipped; the next run catches the data up.
- Needs `node` and `git` on PATH, and the GitHub credential-helper token already stored
  (pushes are non-interactive).
- Inspect / change / remove:
  ```
  schtasks /Query  /TN "BC25 Sandbox Daily Data" /V /FO LIST
  schtasks /Run    /TN "BC25 Sandbox Daily Data"
  schtasks /Delete /TN "BC25 Sandbox Daily Data" /F
  ```
- Progress + errors: `tools/daily_update.log`.

## Flow

```
run_xv31.ps1 (engine, CoinGecko)  ->  xv31_paper_main_output/<YYYYMMDD_HHMMSS>/*.csv
        ->  gen_stageb.js  ->  stageb.json  ->  git push  ->  Vercel auto-deploy
```
