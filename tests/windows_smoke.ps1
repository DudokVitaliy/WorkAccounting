$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scriptPaths = @('windows\launch.ps1','windows\install-shortcut.ps1')
foreach ($relative in $scriptPaths) {
    $path = Join-Path $root $relative
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -ne 0) { throw "PowerShell syntax errors: $relative : $($errors -join ', ')" }
}
$desktop = Join-Path $env:RUNNER_TEMP 'WA Desktop Test'
& (Join-Path $root 'windows\install-shortcut.ps1') -DesktopPath $desktop
$link = Join-Path $desktop 'WorkAccounting.lnk'
if (-not (Test-Path $link)) { throw 'Shortcut was not created' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
if (-not $shortcut.TargetPath.EndsWith('powershell.exe')) { throw 'Unexpected shortcut target' }
if ($shortcut.Arguments -notmatch 'launch.ps1') { throw 'Shortcut points to the wrong script' }
Write-Host 'PASS: PowerShell syntax and Windows desktop shortcut'
# Integration smoke using compiled backend and actual frontend HTTP proxy on Windows.
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$env:WORK_ADMIN_PASSWORD = 'Windows-CI-Only-Strong-Passphrase'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5088'
$apiProc = $null
$webProc = $null
try {
    $apiOut = Join-Path $env:RUNNER_TEMP 'wa-api-out.txt'
    $apiErr = Join-Path $env:RUNNER_TEMP 'wa-api-err.txt'
    $uiOut = Join-Path $env:RUNNER_TEMP 'wa-ui-out.txt'
    $uiErr = Join-Path $env:RUNNER_TEMP 'wa-ui-err.txt'
    $apiProc = Start-Process -FilePath 'dotnet.exe' -ArgumentList @((Join-Path $backend 'bin\Release\net10.0\WorkAccounting.Api.dll'), '--urls', 'http://127.0.0.1:5088') -WorkingDirectory $backend -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
    $webProc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c','npm.cmd run dev') -WorkingDirectory $frontend -PassThru -RedirectStandardOutput $uiOut -RedirectStandardError $uiErr
    $health = $false
    for($i=0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $api = Invoke-RestMethod -Uri 'http://127.0.0.1:5088/api/health' -TimeoutSec 2
            $frontendResult = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
            $proxied = Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 2
            if ($api.status -eq 'ok' -and $proxied.status -eq 'ok' -and $frontendResult.StatusCode -eq 200) {
                $health = $true; break
            }
        } catch { }
    }
    if (-not $health) {
        foreach ($log in @($apiOut,$apiErr,$uiOut,$uiErr)) {
            Write-Host "===== $log ====="
            if (Test-Path $log) { Get-Content $log -Tail 30 | Out-Host }
        }
        foreach ($url in @('http://127.0.0.1:5088/api/health','http://127.0.0.1:5173/','http://127.0.0.1:5173/api/health')) {
            try { $resp=Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3; Write-Host "$url -> $($resp.StatusCode) $($resp.Content)" }
            catch { Write-Host "$url -> $($_.Exception.Message)" }
        }
        throw 'Windows HTTP smoke failed: see diagnostic logs'
    }
    Write-Host 'PASS: Windows API, UI, and frontend-to-backend proxy'
} finally {
    foreach($proc in @($apiProc,$webProc)) {
        if ($null -ne $proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    }
}
