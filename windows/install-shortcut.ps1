param([string]$DesktopPath = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launch = Join-Path $root 'windows\launch.ps1'
if (-not (Test-Path $launch)) { throw 'Не знайдено windows/launch.ps1' }
if (-not (Test-Path $DesktopPath)) { New-Item -Path $DesktopPath -ItemType Directory -Force | Out-Null }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $DesktopPath 'WorkAccounting.lnk'))
$shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launch`""
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'УкрАрмоТех — локальна система обліку робіт'
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $edge) { $shortcut.IconLocation = "$edge,0" }
else { $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220" }
$shortcut.Save()
Write-Host "Ярлик створено: $($shortcut.FullName)"
