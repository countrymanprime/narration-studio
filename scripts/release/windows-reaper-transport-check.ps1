# Release-gate check 9.7 (REAPER play-state timing), scripted: installs REAPER (the evaluation build, silent) on a disposable Windows
# runner, runs integrations/reaper/spikes/transport_timing.lua inside it through run-reaper.ps1 (isolated -cfgfile, scratch project), and
# copies the report to <OutDir>. It records what REAPER did; it fails only when REAPER could not be installed or started or the script
# did not finish, never because the transport refused a state (that is a finding, written in the report).
#
#   pwsh windows-reaper-transport-check.ps1 -OutDir <dir> [-Version 7.80] [-ExpectedSha256 <hex>]
param(
  [Parameter(Mandatory)][string]$OutDir,
  [string]$Version = '7.80',
  [string]$ExpectedSha256 = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$tag = $Version -replace '\.', ''
$installer = Join-Path $env:TEMP "reaper${tag}_x64-install.exe"
$url = "https://www.reaper.fm/files/$($Version.Split('.')[0]).x/reaper${tag}_x64-install.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
$sum = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$sig = Get-AuthenticodeSignature $installer
$info = "REAPER installer $url`nSHA-256 $sum`nsignature $($sig.Status) $($sig.SignerCertificate.Subject)"
Write-Host $info
$info | Set-Content (Join-Path $OutDir 'reaper-installer.txt')
if ($ExpectedSha256 -and $sum -ne $ExpectedSha256.ToLowerInvariant()) { throw "installer SHA-256 $sum differs from the pinned $ExpectedSha256" }
$p = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
if ($p.ExitCode -ne 0) { throw "REAPER installer exited $($p.ExitCode)" }
$exe = 'C:\Program Files\REAPER (x64)\reaper.exe'
if (-not (Test-Path $exe)) { throw "reaper.exe not found at $exe after the silent install" }
Write-Host ("installed: " + (Get-Item $exe).VersionInfo.FileVersion)

$scratch = Join-Path $env:TEMP ('transport-' + [guid]::NewGuid().ToString('N'))
$cfg = Join-Path $env:TEMP ('transport-cfg-' + [guid]::NewGuid().ToString('N'))
$done = Join-Path $scratch 'report.txt'
New-Item -ItemType Directory -Force $scratch | Out-Null
& pwsh -NoProfile -File (Join-Path $repo 'integrations\reaper\spikes\run-reaper.ps1') -Cfg $cfg -Out $scratch `
  -Script (Join-Path $repo 'integrations\reaper\spikes\transport_timing.lua') -Done $done -TimeoutSec 120 -IgnoreErrors |
  Tee-Object -FilePath (Join-Path $OutDir 'driver-log.txt')
Get-ChildItem $scratch -Recurse -File | Where-Object { $_.Name -in 'transport-timing-report.txt', 'report.txt', 'events.log' } |
  ForEach-Object { Copy-Item $_.FullName (Join-Path $OutDir $_.Name) -Force }
$reportFile = Join-Path $OutDir 'transport-timing-report.txt'
if (-not (Test-Path $reportFile)) { throw 'REAPER ran but the script wrote no report (see driver-log.txt)' }
$text = Get-Content $reportFile -Raw
Write-Host $text
if ($env:GITHUB_STEP_SUMMARY) { @('### 9.7 REAPER play-state timing', '```', $text, '```') | Add-Content $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
if ($text -notmatch '(?m)^done$') { throw 'the script stopped before the last step (see the report)' }
