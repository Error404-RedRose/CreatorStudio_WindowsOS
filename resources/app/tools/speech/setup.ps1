# Creator Studio speech engine setup (Windows PowerShell)
# Creates tools/speech/venv and installs the local Whisper stack.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $here "venv"
if (-not (Test-Path $venv)) {
  Write-Host "Creating Creator Studio speech virtual environment..."
  py -3 -m venv $venv
}
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Python venv was not created. Install Python 3.10+ and run this again."
}
& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $here "requirements.txt")
Write-Host ""
Write-Host "Speech engine ready: $python"
Write-Host "Creator Studio uses this venv directly; build-exe verifies it before and after packaging."
