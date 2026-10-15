@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install-shortcut.ps1"
if errorlevel 1 (
 pause
 exit /b 1
)
echo You can now start WorkAccounting using its desktop shortcut.
pause
