<#
  daily_update.ps1 — BC25 Sandbox daily data refresh.

  Chains:  run the xv31 Stage B engine  ->  regenerate stageb.json from the
  newest run  ->  commit + push stageb.json (only if it changed).

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
  if ($LASTEXITCODE -ne 0) { throw "engine run failed (exit $LASTEXITCODE) — see $Engine\xv31_run.log" }

  # 2) regenerate stageb.json from the newest run (reads derived CSVs only)
  Log "step 2/3: regenerating stageb.json"
  & node $Gen
  if ($LASTEXITCODE -ne 0) { throw "gen_stageb failed (exit $LASTEXITCODE)" }

  # 3) commit + push only when stageb.json actually changed
  Log "step 3/3: publishing"
  Set-Location $Sandbox
  if (git status --porcelain -- stageb.json) {
    $asof = (& node -e "process.stdout.write(require('./stageb.json').asof)")
    git add stageb.json
    git commit -m "data: refresh Stage B snapshot (asof $asof)" | Out-Null
    git push | Out-Null
    Log "pushed stageb.json (asof $asof)"
  } else {
    Log "stageb.json unchanged — nothing to publish"
  }

  Log "=== daily_update done ==="
}
catch {
  Log "ERROR: $_"
  exit 1
}
