<#
  daily_update.ps1 - BC25 Sandbox daily data refresh.

  Chains:  run the xv31 Stage B engine  ->  regenerate stageb.json from the
  newest run  ->  commit + push stageb.json + nav_ledger.json (only if changed).

  Ships ONLY derived numbers (NAV / weights / regime). The engine code and its
  CoinGecko key live in the engine folder and are never read or copied here.

  Run by hand:   powershell -NoProfile -ExecutionPolicy Bypass -File tools\daily_update.ps1
  Scheduled:     see tools\README.md ("Scheduled task").
  Log:           tools\daily_update.log
#>
$ErrorActionPreference = "Stop"

$Sandbox = "C:\Users\elite\OneDrive\Documents\BC25_Sandbox"
$Engine  = "C:\Users\elite\OneDrive\Desktop\crypto_index"
$EngineRun = Join-Path $Engine "run_xv31.ps1"
$Gen     = Join-Path $Sandbox "tools\gen_stageb.js"
$Log     = Join-Path $Sandbox "tools\daily_update.log"

function Log($m) { "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m | Tee-Object -FilePath $Log -Append }

try {
  Log "=== daily_update start ==="

  if (-not (Test-Path $EngineRun)) { throw "engine runner not found: $EngineRun" }
  if (-not (Test-Path $Gen))       { throw "generator not found: $Gen" }

  # 1) run the engine -> writes a fresh dated run under xv31_paper_main_output
  Log "step 1/3: running engine ($EngineRun)"
  & $EngineRun
  if ($LASTEXITCODE -ne 0) { throw "engine run failed (exit $LASTEXITCODE) - see $Engine\xv31_run.log" }

  # 2) regenerate stageb.json from the newest run (reads derived CSVs only)
  Log "step 2/3: regenerating stageb.json"
  & node $Gen
  if ($LASTEXITCODE -ne 0) { throw "gen_stageb failed (exit $LASTEXITCODE)" }

  # 2b) Market Mode data (point-in-time record + BTC/USD). NON-BLOCKING: if this
  #     fails (BTC fetch, validation), the Market Mode files stay at the previous
  #     day and everything else still publishes. Failure is logged loudly.
  Log "step 2b: regenerating Market Mode data (gen_terminal.js)"
  $prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"   # node writes errors to stderr; don't let that abort the run
  try {
    $mm = & node (Join-Path $Sandbox "tools\gen_terminal.js") 2>&1 | ForEach-Object { "$_" }
    $mmExit = $LASTEXITCODE
    $mm | ForEach-Object { Log "  $_" }
    if ($mmExit -ne 0) {
      Log "WARNING: gen_terminal failed (exit $mmExit) - Market Mode data NOT updated today"
    } else {
      $dg = & node (Join-Path $Sandbox "tools\pit_diagnostic.js") 2>&1 | ForEach-Object { "$_" }   # dev-only report, git-ignored
      $dg | ForEach-Object { Log "  $_" }
    }
  } catch {
    Log "WARNING: Market Mode step threw: $_ - Market Mode data NOT updated today"
  } finally {
    $ErrorActionPreference = $prevEAP
  }

  # 3) commit + push only when stageb.json actually changed
  #    (also version nav_ledger.json — the fixed-anchor NAV ledger that keeps
  #    the per-share price stable across runs; it changes whenever stageb does)
  Log "step 3/3: publishing"
  Set-Location $Sandbox
  if (git status --porcelain -- stageb.json market-mode/data proofs) {
    $asof = (& node -e "process.stdout.write(require('./stageb.json').asof)")
    git add stageb.json nav_ledger.json market-mode/data proofs
    git commit -m "data: refresh Stage B snapshot (asof $asof)" | Out-Null
    git push | Out-Null
    Log "pushed stageb.json + nav_ledger.json (asof $asof)"
  } else {
    Log "stageb.json unchanged - nothing to publish"
  }

  Log "=== daily_update done ==="
}
catch {
  Log "ERROR: $_"
  exit 1
}
