$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:TWIX_LOG_STDOUT = "1"
$env:CREATOR_STUDIO_VERBOSE = "1"
$env:TWIX_VERBOSE = "1"
$env:ELECTRON_ENABLE_LOGGING = "1"
$env:ELECTRON_ENABLE_STACK_DUMPING = "1"
$env:TWIX_DISCORD_DEBUG = "1"

$exe = $null
# Prefer the unpacked executable when it exists: it is the real Electron
# process, so its stderr carries Chromium and GPU driver messages. The portable
# launcher is the fallback for a standalone download.
if (Test-Path (Join-Path $root "win-unpacked\Creator Studio.exe")) {
  $exe = Join-Path $root "win-unpacked\Creator Studio.exe"
} elseif (Test-Path (Join-Path $root "Creator Studio.exe")) {
  $exe = Join-Path $root "Creator Studio.exe"
}
if (-not $exe) {
  Write-Host "Creator Studio.exe was not found next to this script." -ForegroundColor Red
  exit 1
}

$logRoots = @(
  (Join-Path $env:APPDATA "Creator Studio\data\logs"),
  (Join-Path $env:APPDATA "3d-creator-studio-twilight\data\logs")
)
foreach ($dir in $logRoots) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$consoleOut = Join-Path $logRoots[0] "console-$stamp.out.log"
$consoleErr = Join-Path $logRoots[0] "console-$stamp.err.log"
New-Item -ItemType File -Force -Path $consoleOut, $consoleErr | Out-Null

$existing = Get-Process -Name "Creator Studio" -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Creator Studio is already running. Close it first so the new build and diagnostic logging load." -ForegroundColor Yellow
  Write-Host "Attaching to the newest log instead of starting a second instance."
} else {
  Write-Host "Launching $exe"
  $process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) `
    -RedirectStandardOutput $consoleOut -RedirectStandardError $consoleErr -PassThru
  Write-Host "Creator Studio started (pid $($process.Id))."
}

Start-Sleep -Seconds 2
$latestJsonl = $null
foreach ($dir in $logRoots) {
  $candidate = Get-ChildItem $dir -Filter "electron-*.jsonl" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($candidate -and (-not $latestJsonl -or $candidate.LastWriteTime -gt $latestJsonl.LastWriteTime)) {
    $latestJsonl = $candidate
  }
}

Write-Host ""
Write-Host "Live console log : $consoleOut"
Write-Host "Driver/stderr log: $consoleErr"
if ($latestJsonl) {
  Write-Host "Structured log   : $($latestJsonl.FullName)"
} else {
  Write-Host "Structured log   : waiting for the first JSONL entry"
}
Write-Host ""

$files = @($consoleOut, $consoleErr)
if ($latestJsonl) { $files += $latestJsonl.FullName }

Get-Content -Path $files -Wait -Tail 25 | ForEach-Object {
  $line = $_
  if ($line -match '^\s*\{.*"level"\s*:') {
    try {
      $entry = $line | ConvertFrom-Json
      $data = ""
      if ($entry.data) { $data = " " + ($entry.data | ConvertTo-Json -Compress -Depth 8) }
      Write-Host ("[" + $entry.ts + "] " + $entry.level.ToUpper() + " " + $entry.source + ": " + $entry.message + $data)
    } catch {
      Write-Host $line
    }
  } else {
    Write-Host $line
  }
}
