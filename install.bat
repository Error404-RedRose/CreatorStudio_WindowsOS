@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Creator Studio - Installer

rem ---------------------------------------------------------------------------
rem  Creator Studio installer
rem
rem  Preferred: download and run the signed-package-style Setup EXE from the
rem  latest Windows GitHub release. The installer contains every runtime file,
rem  including the portable speech engine, so it does not depend on Git, Git
rem  LFS, Python, or a repository ZIP.
rem
rem  If this folder already contains a complete unpacked build, launch it
rem  directly instead.
rem ---------------------------------------------------------------------------

set "REPO=Error404-RedRose/CreatorStudio_WindowsOS"
set "APP=Creator Studio.exe"
set "INSTALLER=CreatorStudio-Setup.exe"
set "DOWNLOAD_URL=https://github.com/%REPO%/releases/latest/download/%INSTALLER%"
set "RELEASES_URL=https://github.com/%REPO%/releases/latest"
set "TARGET=%TEMP%\%INSTALLER%"
set "MIN_PORTABLE_BYTES=100000000"
set "MIN_INSTALLER_BYTES=50000000"
set "EXITCODE=0"

echo ============================================================
echo   Creator Studio - Installer
echo ============================================================
echo.
echo   Source : %RELEASES_URL%
echo.

call :PortableIsComplete
if "%PORTABLE_READY%"=="1" goto :LaunchPortable

echo Downloading the latest Creator Studio installer...
echo.
del /f /q "%TARGET%" >nul 2>&1
where curl.exe >nul 2>&1
if errorlevel 1 goto :DownloadWithPowerShell

curl.exe --fail --location --retry 4 --retry-delay 2 --output "%TARGET%" "%DOWNLOAD_URL%"
if errorlevel 1 goto :DownloadFailed
goto :VerifyInstaller

:DownloadWithPowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TARGET%' -UseBasicParsing"
if errorlevel 1 goto :DownloadFailed

:VerifyInstaller
call :FileIsLargeEnough "%TARGET%" %MIN_INSTALLER_BYTES%
if not "%FILE_OK%"=="1" goto :DownloadFailed

echo Installer downloaded successfully.
echo Launching the Creator Studio setup...
echo.
start "" /wait "%TARGET%"
if errorlevel 1 (
  echo.
  echo The installer returned an error. Open the release page to try again:
  echo   %RELEASES_URL%
  set "EXITCODE=1"
  goto :end
)
echo.
echo Setup finished. Use the Creator Studio shortcut from the Start menu or desktop.
goto :end

:LaunchPortable
echo This folder already contains a complete portable build.
echo Starting Creator Studio...
start "" "%~dp0%APP%"
goto :end

:PortableIsComplete
set "PORTABLE_READY=0"
if not exist "%~dp0%APP%" goto :eof
if not exist "%~dp0resources\app\dist\index.html" goto :eof
call :FileIsLargeEnough "%~dp0%APP%" %MIN_PORTABLE_BYTES%
if not "%FILE_OK%"=="1" goto :eof
set "PORTABLE_READY=1"
goto :eof

:FileIsLargeEnough
set "FILE_OK=0"
if not exist "%~1" goto :eof
for %%F in ("%~1") do set "FILE_BYTES=%%~zF"
if not defined FILE_BYTES goto :eof
if %FILE_BYTES% LSS %~2 goto :eof
set "FILE_OK=1"
goto :eof

:DownloadFailed
echo.
echo ERROR: The Creator Studio installer could not be downloaded or verified.
echo Check the internet connection and try again, or open:
echo   %RELEASES_URL%
set "EXITCODE=1"
goto :end

:end
echo.
if not "%EXITCODE%"=="0" (
  echo Installer finished with errors. Read the messages above.
) else (
  echo Done.
)
pause
exit /b %EXITCODE%
