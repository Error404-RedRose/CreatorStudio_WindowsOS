@echo off
setlocal
cd /d "%~dp0"
title Creator Studio Emergency Update
echo ============================================================
echo  Creator Studio - Emergency update / repair
echo ============================================================
echo  This closes Creator Studio and downloads the newest GitHub build.
echo  User documents, projects, settings and activation are kept.
echo.
if not exist "%~dp0resources\app\electron\update-helper.ps1" (
  echo ERROR: This script must sit in the Creator Studio unpacked build folder.
  echo        The expected file resources\app\electron\update-helper.ps1 is missing.
  pause
  exit /b 1
)
taskkill /IM "Creator Studio.exe" /T /F >nul 2>&1
timeout /t 2 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0resources\app\electron\update-helper.ps1" ^
  -InstallDir "%~dp0" -ExeName "Creator Studio.exe" ^
  -Repo "Error404-RedRose/CreatorStudio_WindowsOS" -Branch "main" -ParentPid 0
if errorlevel 1 (
  echo.
  echo Update failed. Review the messages above and the update log in %%TEMP%%.
  pause
  exit /b 1
)
echo.
echo Creator Studio update completed.
pause
