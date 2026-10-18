# Release-gate checks 9.2 (install on a clean machine) and 9.3 (upgrade over an existing install), scripted for a clean Windows runner.
#
#   pwsh windows-install-check.ps1 -Setup <new setup.exe> [-PreviousSetup <older setup.exe>] -OutDir <dir>
#
# Without -PreviousSetup: install, assert, start, uninstall, assert (9.2). With it: install the previous setup, seed the narrator's
# settings and recent projects, run the new setup over it, assert what survived and the version it reports (9.3), then uninstall.
# It writes <OutDir>/install-check.json and install-check.md and exits 1 when any check failed. Evidence for the owner, not a gate.
# It changes the machine it runs on (installs a program, writes %APPDATA%\narration-utils): run it only on a disposable runner.
param(
  [Parameter(Mandatory)][string]$Setup,
  [string]$PreviousSetup = '',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$ProductName = 'Narration Studio',
  [int]$TimeoutSec = 300
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$checks = New-Object System.Collections.Generic.List[object]
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  $checks.Add([pscustomobject]@{ name = $name; ok = $ok; detail = $detail })
  Write-Host ("{0} {1}{2}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $name, $(if ($detail) { " :: $detail" } else { '' }))
}

# The uninstall key is NarrationUtils today (project.nsi UNINST_KEY_NAME) and NarrationStudio after #1816 phase 2: look for both.
$uninstallRoot = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
$keyNames = @('NarrationUtils', 'NarrationStudio')
function Get-UninstallEntries([string]$hive) {
  $found = @()
  foreach ($name in $keyNames) {
    foreach ($view in @('Registry64', 'Registry32')) {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
      $key = $base.OpenSubKey("$uninstallRoot\$name")
      if ($key) {
        $found += [pscustomobject]@{ Name = $name; View = $view; InstallLocation = $key.GetValue('InstallLocation'); DisplayVersion = $key.GetValue('DisplayVersion'); UninstallString = $key.GetValue('UninstallString') }
        $key.Close()
      }
    }
  }
  return $found
}
function Get-UserEntries { return @(Get-UninstallEntries 'CurrentUser' | Sort-Object Name -Unique) }
function Get-MachineEntries { return @(Get-UninstallEntries 'LocalMachine') }

function Invoke-Silent([string]$file, [string]$label) {
  $p = Start-Process -FilePath $file -ArgumentList '/S' -PassThru
  if (-not $p.WaitForExit($TimeoutSec * 1000)) { $p.Kill(); Check "$label finished within ${TimeoutSec}s" $false; return $false }
  Check "$label exit code 0" ($p.ExitCode -eq 0) "exit code $($p.ExitCode)"
  return ($p.ExitCode -eq 0)
}
# A GUI-subsystem program's stdout can be lost, so the output goes through cmd's own redirection to a file.
function Get-ReportedVersion([string]$exe) {
  $file = Join-Path $OutDir ([guid]::NewGuid().ToString('N') + '.txt')
  & cmd.exe /c "`"$exe`" --version > `"$file`" 2>&1"
  $text = if (Test-Path $file) { (Get-Content $file -Raw).Trim() } else { '' }
  Remove-Item $file -Force -ErrorAction SilentlyContinue
  return $text
}
function Get-Shortcut([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
  return [pscustomobject]@{ Target = $s.TargetPath; Arguments = $s.Arguments }
}
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkApp = Join-Path $startMenu "$ProductName.lnk"
$lnkAudacity = Join-Path $startMenu "$ProductName for Audacity.lnk"
$lnkDesktop = Join-Path $desktop "$ProductName.lnk"

function Assert-Installed([string]$phase) {
  $user = Get-UserEntries
  Check "${phase}: one per-user uninstall entry under HKCU" ($user.Count -eq 1) (($user | ForEach-Object { "$($_.Name) ($($_.View))" }) -join ', ')
  Check "${phase}: no machine-wide uninstall entry under HKLM" ((Get-MachineEntries).Count -eq 0)
  $entry = $user | Select-Object -First 1
  $dir = if ($entry) { $entry.InstallLocation } else { '' }
  $expected = Join-Path $env:LOCALAPPDATA "Programs\$ProductName"
  Check "${phase}: installed under %LOCALAPPDATA%\Programs" ($dir -and ($dir.TrimEnd('\') -ieq $expected)) "InstallLocation=$dir"
  $exe = if ($dir) { Join-Path $dir 'narration-utils.exe' } else { '' }
  Check "${phase}: narration-utils.exe is there" ($exe -and (Test-Path $exe)) $exe
  Check "${phase}: uninstall.exe is there" ($dir -and (Test-Path (Join-Path $dir 'uninstall.exe')))
  Check "${phase}: no files under Program Files" (-not (Test-Path "$env:ProgramFiles\$ProductName"))
  $app = Get-Shortcut $lnkApp
  Check "${phase}: Start Menu shortcut points at the program" ($app -and $exe -and ($app.Target -ieq $exe)) $(if ($app) { $app.Target } else { 'missing' })
  $aud = Get-Shortcut $lnkAudacity
  Check "${phase}: Start Menu shortcut 'for Audacity' passes --daw Audacity" ($aud -and $exe -and ($aud.Target -ieq $exe) -and ($aud.Arguments.Trim() -eq '--daw Audacity')) $(if ($aud) { "$($aud.Target) $($aud.Arguments)" } else { 'missing' })
  $desk = Get-Shortcut $lnkDesktop
  Check "${phase}: desktop shortcut points at the program" ($desk -and $exe -and ($desk.Target -ieq $exe)) $(if ($desk) { $desk.Target } else { 'missing' })
  return $entry
}

function Test-AppStarts([string]$exe, [string]$phase) {
  $version = Get-ReportedVersion $exe
  Check "${phase}: --version prints a version" ($version -match '^\S+$') $version
  # The window: started with launcher-style arguments (a scratch project folder), it must still be running after a few seconds.
  $project = Join-Path $env:RUNNER_TEMP ('project-' + [guid]::NewGuid().ToString('N'))
  if (-not $env:RUNNER_TEMP) { $project = Join-Path $env:TEMP ('project-' + [guid]::NewGuid().ToString('N')) }
  New-Item -ItemType Directory -Force $project | Out-Null
  $p = Start-Process -FilePath $exe -ArgumentList @('--project-folder', "`"$project`"", '--project-name', 'InstallCheck', '--daw', 'Standalone') -PassThru
  Start-Sleep -Seconds 10
  $p.Refresh()
  Check "${phase}: the app window process is still running after 10 s" (-not $p.HasExited) $(if ($p.HasExited) { "exited with $($p.ExitCode)" } else { "pid $($p.Id)" })
  Get-Process | Where-Object { $_.Path -ieq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  return $version
}

function Wait-Gone([string]$path, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Test-Path $path) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  return -not (Test-Path $path)
}
function Invoke-Uninstall($entry, [string]$phase) {
  $dir = $entry.InstallLocation
  $uninstaller = Join-Path $dir 'uninstall.exe'
  # NSIS copies a silent uninstaller to %TEMP% and returns at once, so removal is polled for.
  Start-Process -FilePath $uninstaller -ArgumentList '/S' | Out-Null
  $gone = Wait-Gone (Join-Path $dir 'narration-utils.exe') 120
  Check "${phase}: uninstall removed narration-utils.exe" $gone
  Start-Sleep -Seconds 5
  Check "${phase}: uninstall removed the HKCU uninstall entry" ((Get-UserEntries).Count -eq 0)
  Check "${phase}: uninstall removed the Start Menu shortcuts" (-not (Test-Path $lnkApp) -and -not (Test-Path $lnkAudacity))
  Check "${phase}: uninstall removed the desktop shortcut" (-not (Test-Path $lnkDesktop))
  Check "${phase}: the install folder is gone (or empty of the program)" (-not (Test-Path $dir) -or -not (Get-ChildItem $dir -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'narration-utils.exe*' }))
}

$report = [ordered]@{ setup = (Split-Path $Setup -Leaf); previousSetup = $(if ($PreviousSetup) { Split-Path $PreviousSetup -Leaf } else { $null }) }
Check 'the machine starts clean (no uninstall entry, no install folder)' ((Get-UserEntries).Count -eq 0 -and -not (Test-Path (Join-Path $env:LOCALAPPDATA "Programs\$ProductName")))

$settingsDir = Join-Path $env:APPDATA 'narration-utils'
$seeded = @{
  'global-settings.json'  = '{"installCheckSeed":"settings survive an upgrade"}'
  'recent-projects.json'  = '{"installCheckSeed":"recent projects survive an upgrade"}'
}

if ($PreviousSetup) {
  # 9.3: previous release first, then the new setup over it.
  if (Invoke-Silent $PreviousSetup 'previous setup /S') {
    $before = Assert-Installed 'previous'
    $exe = Join-Path $before.InstallLocation 'narration-utils.exe'
    $report.previousVersion = Get-ReportedVersion $exe
    $report.previousKey = $before.Name
    Write-Host "previous version: $($report.previousVersion), uninstall key $($before.Name)"
    New-Item -ItemType Directory -Force $settingsDir | Out-Null
    foreach ($name in $seeded.Keys) { Set-Content -Path (Join-Path $settingsDir $name) -Value $seeded[$name] -NoNewline -Encoding utf8 }
    if (Invoke-Silent $Setup 'new setup /S over the previous install') {
      $after = Assert-Installed 'upgraded'
      $report.newKey = $after.Name
      Check 'upgrade installed to the folder the previous install used' ($after.InstallLocation -ieq $before.InstallLocation)
      if ($before.Name -ne $after.Name) { Write-Host "NOTE uninstall key moved from $($before.Name) to $($after.Name) (#1816 phase 2)" }
      $newExe = Join-Path $after.InstallLocation 'narration-utils.exe'
      $report.newVersion = Get-ReportedVersion $newExe
      Check 'the program now reports a different version than before' ($report.newVersion -and ($report.newVersion -ne $report.previousVersion)) "$($report.previousVersion) -> $($report.newVersion)"
      Check 'the uninstall entry reports the new version' ($after.DisplayVersion -and ("$($report.newVersion)" -like "*$($after.DisplayVersion)*" -or "$($after.DisplayVersion)" -like "*$($report.newVersion)*")) "DisplayVersion=$($after.DisplayVersion)"
      foreach ($name in $seeded.Keys) {
        $path = Join-Path $settingsDir $name
        Check "upgrade kept $name byte for byte" ((Test-Path $path) -and ((Get-Content $path -Raw) -eq $seeded[$name]))
      }
      Test-AppStarts $newExe 'upgraded' | Out-Null
      foreach ($name in $seeded.Keys) {
        $path = Join-Path $settingsDir $name
        Check "starting the upgraded app left $name readable" ((Test-Path $path) -and ((Get-Content $path -Raw) -match 'installCheckSeed|\{'))
      }
      Invoke-Uninstall $after 'upgraded'
    }
  }
} else {
  # 9.2: a clean install.
  if (Invoke-Silent $Setup 'setup /S') {
    $entry = Assert-Installed 'installed'
    $report.uninstallKey = $entry.Name
    if ($entry.Name -eq 'NarrationUtils') { Write-Host 'NOTE the uninstall key is still NarrationUtils (#1816 phase 2 pending)' }
    $exe = Join-Path $entry.InstallLocation 'narration-utils.exe'
    $report.version = Test-AppStarts $exe 'installed'
    Check 'the uninstall entry reports the version the program reports' ($entry.DisplayVersion -and ("$($report.version)" -like "*$($entry.DisplayVersion)*" -or "$($entry.DisplayVersion)" -like "*$($report.version)*")) "DisplayVersion=$($entry.DisplayVersion)"
    Invoke-Uninstall $entry 'installed'
  }
}
Check 'the settings folder is left alone by uninstall (documented behaviour)' ($true) $(if (Test-Path $settingsDir) { 'present' } else { 'absent (nothing had created it)' })

$report.checks = $checks
$report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutDir 'install-check.json') -Encoding utf8
$failed = @($checks | Where-Object { -not $_.ok })
$md = @("### Windows install check ($(if ($PreviousSetup) { '9.3 upgrade' } else { '9.2 clean install' }))", '', "$($checks.Count - $failed.Count) passed, $($failed.Count) failed.", '', '| Result | Check | Detail |', '| - | - | - |')
foreach ($c in $checks) { $md += "| $(if ($c.ok) { 'pass' } else { '**FAIL**' }) | $($c.name) | $(([string]$c.detail) -replace '\|', '/') |" }
$md | Set-Content (Join-Path $OutDir 'install-check.md') -Encoding utf8
if ($env:GITHUB_STEP_SUMMARY) { $md | Add-Content $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
if ($failed.Count -gt 0) { exit 1 }
