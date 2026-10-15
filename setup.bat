@echo off
cd /d "%~dp0"
echo Installing frontend packages...
cd frontend
call npm install
if errorlevel 1 (echo Frontend installation failed & pause & exit /b 1)
cd ..\backend
echo Restoring backend...
dotnet restore
if errorlevel 1 (echo Backend restore failed & pause & exit /b 1)
echo Setup complete.
pause
