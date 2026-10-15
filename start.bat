@echo off
cd /d "%~dp0"
if not exist "backend\admin-password.txt" (
 echo Please create backend\admin-password.txt with your own unique password of at least 10 characters.
 pause
 exit /b 1
)
set /p WORK_ADMIN_PASSWORD=<"backend\admin-password.txt"
if "%WORK_ADMIN_PASSWORD%"=="" (echo Password file is empty & pause & exit /b 1)
start "WorkAccounting API" cmd /k "cd /d "%~dp0backend" && dotnet run --urls http://127.0.0.1:5088"
start "WorkAccounting UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo Open http://127.0.0.1:5173
pause
