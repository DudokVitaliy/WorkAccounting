@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\launch.ps1"
if errorlevel 1 (
 echo Error running WorkAccounting. See the message above.
 pause
 exit /b 1
)
