# Drive a real Audacity 3 over its named pipes on a Windows runner (A3-T30): download the pinned portable zip, check its SHA-256, enable
# mod-script-pipe in a portable profile, start Audacity (twice: the first start on a profile it has never seen records the module as
# failed), run A3-T30, merge the results. Hosted, workflow_dispatch only (.github/workflows/real-audacity3-windows.yml).
#
#   powershell -File tests/audacity3/real/edits/windows.ps1 [-Work <folder>]
#
# The runner has no audio device, so nothing here records. This script has never run on a Windows machine: its first run is the first
# test of it (docs/research/audacity-3-capability-matrix.md, A3-T30).
param([string]$Work = (Join-Path $env:RUNNER_TEMP 'nu-audacity-win'))
$ErrorActionPreference = 'Stop'

# Pinned. Bump the version and the hash together, from the release page's asset. The hash is the only identity the zip has.
$Version = '3.7.7'
$Url = "https://github.com/audacity/audacity/releases/download/Audacity-$Version/audacity-win-$Version-64bit.zip"
$Sha256 = '1d345a48a698c57363475b7b3a0b113f796c2a49c6254d5f41dae53b9f4017d8'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Out = Join-Path $Work 'out'
New-Item -ItemType Directory -Force -Path $Work, $Out, (Join-Path $Work 'logs') | Out-Null
function Log($m) { Write-Host "[real-audacity3-windows] $m" }

$zip = Join-Path $Work "audacity-win-$Version-64bit.zip"
if (-not (Test-Path $zip) -or (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $Sha256) {
    Log "downloading Audacity $Version"
    Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing
}
$got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($got -ne $Sha256) { throw "the download is not the pinned zip: $got" }
$app = Join-Path $Work 'app'
if (-not (Test-Path (Join-Path $app 'Audacity.exe'))) {
    Expand-Archive -Path $zip -DestinationPath $Work -Force
    $inner = Get-ChildItem $Work -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'Audacity.exe') } | Select-Object -First 1
    Move-Item $inner.FullName $app
}
$exe = Join-Path $app 'Audacity.exe'
if (-not (Test-Path (Join-Path $app 'modules\mod-script-pipe.dll'))) { throw 'the zip has no modules\mod-script-pipe.dll' }

# A "Portable Settings" folder next to Audacity.exe makes Audacity keep its profile there: nothing under the runner's user profile.
$settings = Join-Path $app 'Portable Settings'
$cfg = Join-Path $settings 'audacity.cfg'
function Seed-Config {
    New-Item -ItemType Directory -Force -Path $settings | Out-Null
    $text = if (Test-Path $cfg) { Get-Content $cfg -Raw } else { '' }
    $temp = (Join-Path $Work 'audacity-temp') -replace '\\', '/'
    foreach ($block in @(
        @('UpdateNoticeShown=1', "[Update]`nDefaultUpdatesChecking=0`nUpdateNoticeShown=1`n"),
        @('ShowSplashScreen=', "[GUI]`nShowSplashScreen=0`n"),
        @('TempDir=', "[Directories]`nTempDir=$temp`n"),
        @('mod-script-pipe=', "[Module]`nmod-script-pipe=1`n"))) {
        if ($text -notmatch [regex]::Escape($block[0])) { $text += $block[1] }
    }
    $text = $text -replace 'mod-script-pipe=\d', 'mod-script-pipe=1'
    Set-Content -Path $cfg -Value $text -Encoding ASCII
}
function Pipe-Exists { [bool](Get-ChildItem '\\.\pipe\' -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'ToSrvPipe' }) }

Get-Process Audacity -ErrorAction SilentlyContinue | Stop-Process -Force
New-Item -ItemType Directory -Force -Path (Join-Path $Work 'audacity-temp') | Out-Null
Seed-Config
$up = $false
foreach ($attempt in 1, 2) {
    Start-Process -FilePath $exe -WorkingDirectory $app | Out-Null
    for ($i = 1; $i -le 40; $i++) {
        if (Pipe-Exists) { $up = $true; break }
        if ((Test-Path $cfg) -and ((Get-Content $cfg -Raw) -match 'mod-script-pipe=4')) { break }
        Start-Sleep -Seconds 1
    }
    Log "start ${attempt}: pipe up=$up after $i s; config says: $((Select-String -Path $cfg -Pattern 'mod-script-pipe=\d' | Select-Object -First 1).Line)"
    if ($up) { break }
    Get-Process Audacity -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    Remove-Item (Join-Path $Work 'audacity-temp') -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path (Join-Path $Work 'audacity-temp') | Out-Null
    Seed-Config
}
Start-Sleep -Seconds 3

$env:NU_AUDACITY_OUT = $Out
$env:NU_AUDACITY_TESTWORK = Join-Path $Work 'testwork'
$env:NU_AUDACITY_VERSION = $Version
$env:NU_RUNNER_IMAGE = "$env:ImageOS-$env:ImageVersion"
$env:PYTHONIOENCODING = 'utf-8'
$status = 0
if (-not $up) {
    # The module did not load on the hosted image: that is the result, and it is recorded rather than hidden.
    New-Item -ItemType Directory -Force -Path (Join-Path $Out 'results') | Out-Null
    $row = @{ id = 'A3-T30'; title = 'Windows named pipes'; status = 'FAIL'; audacity = $Version; runner = $env:NU_RUNNER_IMAGE; platform = 'win32';
              steps = @(@{ step = 'launch'; status = 'FAIL'; detail = 'no ToSrvPipe after two starts: mod-script-pipe did not load on this runner image'; data = @{} }) }
    $row | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Out 'results\A3-T30.json') -Encoding UTF8
    $status = 1
} else {
    python (Join-Path $Here 'run_tests.py') A3-T30
    if ($LASTEXITCODE -ne 0) { $status = 1 }
}
python (Join-Path $Here 'summarize.py') $Out
Get-Process Audacity -ErrorAction SilentlyContinue | Stop-Process -Force
exit $status
