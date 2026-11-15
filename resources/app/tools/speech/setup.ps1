# Creator Studio speech engine setup (Windows PowerShell)
# Builds the development venv and the relocatable Python runtime that is
# packaged into the Windows installer.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $here "venv"
$runtime = Join-Path $here "runtime"
$runtimePython = Join-Path $runtime "python.exe"
$runtimeVersion = "3.11.18"
$runtimeBuild = "20261110"
$runtimeArchive = Join-Path $env:TEMP "creator-studio-python-$runtimeVersion.tar.gz"
$runtimeUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/$runtimeBuild/cpython-$runtimeVersion%2B$runtimeBuild-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"

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

if (-not (Test-Path $runtimePython)) {
  Write-Host "Downloading the relocatable Python $runtimeVersion runtime for packaging..."
  curl.exe --fail --location --retry 4 --output $runtimeArchive $runtimeUrl
  if (Test-Path $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  tar.exe -xzf $runtimeArchive -C $runtime --strip-components 1
  if (-not (Test-Path $runtimePython)) {
    throw "The relocatable Python runtime was not extracted."
  }
  & $runtimePython -m pip install --upgrade pip
  & $runtimePython -m pip install -r (Join-Path $here "requirements.txt")
}
& $runtimePython -c "import numpy, sounddevice, webrtcvad, faster_whisper, keyboard, pyautogui; print('Speech runtime imports OK')"

Write-Host ""
Write-Host "Speech engine ready: $python"
Write-Host "Packaged runtime:   $runtimePython"
