# Real-REAPER bridge check on a disposable Windows runner: installs the REAPER evaluation build (pinned SHA-256), fetches one pinned
# LibriVox chapter, starts REAPER isolated (-cfgfile, through integrations/reaper/spikes/run-reaper.ps1) with launcher.lua, and
# runs drive.py against the live bridge. Design and limits: docs/research/real-reaper-ci-integration.md.
#
#   pwsh run-real-reaper-check.ps1 -OutDir <dir> -ExpectedSha256 <hex> [-Version 7.80] [-ExpectedSize <bytes>]
param(
  [Parameter(Mandatory)][string]$OutDir,
  [Parameter(Mandatory)][string]$ExpectedSha256,
  [string]$Version = '7.80',
  [long]$ExpectedSize = 0
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$tag = $Version -replace '\.', ''
$installer = Join-Path $env:TEMP "reaper${tag}_x64-install.exe"
$url = "https://www.reaper.fm/files/$($Version.Split('.')[0]).x/reaper${tag}_x64-install.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
$sum = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$sig = Get-AuthenticodeSignature $installer
"REAPER installer $url`nSHA-256 $sum`nsignature $($sig.Status) $($sig.SignerCertificate.Subject)" | Tee-Object -FilePath (Join-Path $OutDir 'reaper-installer.txt')
# Nothing is run before the installer matches the pin (same rule as windows-reaper-transport-check.ps1).
if ($sum -ne $ExpectedSha256.Trim().ToLowerInvariant()) { throw "installer SHA-256 $sum differs from the pinned $ExpectedSha256" }
if ($ExpectedSize -gt 0 -and (Get-Item $installer).Length -ne $ExpectedSize) { throw "installer size differs from the pinned $ExpectedSize" }
$exe = 'C:\Program Files\REAPER (x64)\reaper.exe'
$p = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
if (-not (Test-Path $exe)) { & 7z x $installer "-oC:\Program Files\REAPER (x64)" -y | Select-Object -Last 3 }
if (-not (Test-Path $exe)) { throw "reaper.exe not found at $exe after the install" }
Write-Host ("installed: " + (Get-Item $exe).VersionInfo.FileVersion)

# The pinned LibriVox chapter (tests/fixtures/audio/librivox-alice/sources.json): SHA-256 checked, kept outside git.
$audioDir = Join-Path $env:TEMP 'librivox-ci'
$audio = (& python (Join-Path $PSScriptRoot 'drive.py') fetch --dir $audioDir | Select-Object -Last 1)
if (-not (Test-Path $audio)) { throw 'the LibriVox chapter was not fetched' }

$work = Join-Path $env:TEMP ('real-reaper-' + [guid]::NewGuid().ToString('N'))
$cfg = Join-Path $work 'cfg'; $out = Join-Path $work 'out'; $session = Join-Path $work 'session'
New-Item -ItemType Directory -Force $cfg, $out, (Join-Path $session 'commands') | Out-Null
$project = Join-Path $work 'CiBook.rpp'
Set-Content -Path $project -Value '<REAPER_PROJECT 0.1 "7.0" 0' -Encoding ascii
Add-Content -Path $project -Value '>' -Encoding ascii
$env:NARRATION_CI_SESSION = $session; $env:NARRATION_CI_OUT = $out; $env:NARRATION_CI_CFG = $cfg
$env:NARRATION_CI_AUDIO = $audio; $env:NARRATION_CI_REAPER_DIR = Join-Path $repo 'integrations\reaper'

# REAPER and its dialog handler run in the background; the driver talks to the bridge in the foreground.
$job = Start-Job -ArgumentList $repo, $cfg, $out, $project, $PSScriptRoot -ScriptBlock {
  param($repo, $cfg, $out, $project, $here)
  & pwsh -NoProfile -File (Join-Path $repo 'integrations\reaper\spikes\run-reaper.ps1') -Cfg $cfg -Out $out `
    -Script (Join-Path $here 'launcher.lua') -Project $project -Done (Join-Path $out 'done') -TimeoutSec 240 -IgnoreErrors
}
$rc = 1
try {
  & python (Join-Path $PSScriptRoot 'drive.py') run --session $session --out $out --target real --timeout 90
  $rc = $LASTEXITCODE
} finally {
  Wait-Job $job -Timeout 60 | Out-Null
  Receive-Job $job *>&1 | Tee-Object -FilePath (Join-Path $OutDir 'driver-log.txt')
  Remove-Job $job -Force
}
foreach ($f in 'results.md', 'results.json', 'regions.txt') { if (Test-Path (Join-Path $out $f)) { Copy-Item (Join-Path $out $f) $OutDir -Force } }
foreach ($f in (Join-Path $session 'events.log'), (Join-Path $session 'fixture.json')) { if (Test-Path $f) { Copy-Item $f $OutDir -Force } }
if ((Test-Path (Join-Path $out "results.md")) -and $env:GITHUB_STEP_SUMMARY) {
  @('### Real-REAPER bridge check', (Get-Content (Join-Path $out 'results.md') -Raw)) | Add-Content $env:GITHUB_STEP_SUMMARY -Encoding utf8
}
if ($rc -ne 0) { throw "a row failed or the driver stopped (exit $rc); see results.md and driver-log.txt" }
