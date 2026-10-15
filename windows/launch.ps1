# Open WorkAccounting in a dedicated Microsoft Edge application window.
# On first use, run setup.bat and create backend/admin-password.txt (admin password).
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    throw 'Спочатку запустіть setup.bat для встановлення залежностей.'
}
if (-not (Get-Command 'dotnet' -ErrorAction SilentlyContinue)) { throw 'Не встановлено .NET 10 SDK.' }
if (-not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue)) { throw 'Не встановлено Node.js/npm.' }
$pwdFile = Join-Path $backend 'admin-password.txt'
if (Test-Path $pwdFile) {
    $secret = (Get-Content -LiteralPath $pwdFile -Raw).TrimEnd("`r", "`n")
    if ($secret.Length -lt 10) { throw 'Пароль адміністратора має містити щонайменше 10 символів.' }
    $env:WORK_ADMIN_PASSWORD = $secret
} else {
    Remove-Item Env:WORK_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    if (-not (Test-Path (Join-Path $backend 'workaccounting_v2.db'))) {
        throw 'Перший запуск: створіть backend/admin-password.txt (від 10 символів).'
    }
}
$apiUrl = 'http://127.0.0.1:5088/api/health'
$uiUrl = 'http://127.0.0.1:5173'
function Test-Endpoint([string]$url) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $resp.StatusCode -eq 200
    } catch { return $false }
}
# Start servers only when not already running, to avoid duplicate listener failures.
if (-not (Test-Endpoint $apiUrl)) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', 'title WorkAccounting API && dotnet run --no-launch-profile --urls http://127.0.0.1:5088') -WorkingDirectory $backend | Out-Null
}
if (-not (Test-Endpoint $uiUrl)) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', 'title WorkAccounting UI && npm.cmd run dev') -WorkingDirectory $frontend | Out-Null
}
$ready = $false
for ($i=0; $i -lt 60; $i++) {
    if ((Test-Endpoint $apiUrl) -and (Test-Endpoint $uiUrl)) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) {
    throw 'Сервер не відповідає. Перевірте вікна WorkAccounting API та WorkAccounting UI.'
}
if (-not $NoBrowser) {
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    $edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($edge) { Start-Process -FilePath $edge -ArgumentList "--app=$uiUrl" }
    else { Start-Process $uiUrl }
}
Write-Host "WorkAccounting запущено: $uiUrl"
