@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Creator Studio - live diagnostic log
echo ==================================
echo Starting Creator Studio and streaming main, backend, renderer, GPU and
echo driver messages to this terminal.
echo Close this window when you are finished watching; Creator Studio keeps running.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-with-logs.ps1"
echo.
echo Log stream closed.
pause
