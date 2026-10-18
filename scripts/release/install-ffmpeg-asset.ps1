# Installs the catalogued FFmpeg encoder the way the app's asset installer does, for a CI runner: downloads the file named in
# config/encoder-assets.json, checks its size and SHA-256, keeps only the catalogued binary, checks that binary's SHA-256 and size,
# and writes it as <OutDir>/ffmpeg.exe. Prints the path as the last line and sets FFMPEG_PATH for later workflow steps.
#
#   pwsh install-ffmpeg-asset.ps1 -OutDir <dir> [-Catalog config/encoder-assets.json] [-Id ffmpeg-7.1-essentials-win64]
#
# It refuses on any mismatch; it never trusts a file that did not match the catalogue's hash.
param(
  [Parameter(Mandatory)][string]$OutDir,
  [string]$Catalog = (Join-Path $PSScriptRoot '..\..\config\encoder-assets.json'),
  [string]$Id = 'ffmpeg-7.1-essentials-win64'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entry = (Get-Content $Catalog -Raw | ConvertFrom-Json).encoders | Where-Object { $_.id -eq $Id }
if (-not $entry) { throw "no encoder $Id in $Catalog" }
if ($entry.files.Count -ne 1) { throw "expected one file for $Id, found $($entry.files.Count)" }
$file = $entry.files[0]
New-Item -ItemType Directory -Force $OutDir | Out-Null
$download = Join-Path $OutDir $file.name
Invoke-WebRequest -Uri $file.url -OutFile $download -UseBasicParsing
$item = Get-Item $download
if ($item.Length -ne $file.size) { throw "$($file.name) is $($item.Length) bytes, the catalogue says $($file.size)" }
$sum = (Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sum -ne $file.sha256) { throw "$($file.name) SHA-256 is $sum, the catalogue says $($file.sha256)" }
Write-Host "downloaded $($file.name): $($item.Length) bytes, SHA-256 matches the catalogue"
$zip = [System.IO.Compression.ZipFile]::OpenRead($download)
try {
  $member = $zip.Entries | Where-Object { $_.FullName -eq $entry.binary }
  if (-not $member) { throw "$($entry.binary) is not in $($file.name)" }
  $target = Join-Path $OutDir 'ffmpeg.exe'
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($member, $target, $true)
} finally { $zip.Dispose() }
$binary = Get-Item $target
if ($binary.Length -ne $entry.installedSize) { throw "ffmpeg.exe is $($binary.Length) bytes, the catalogue says $($entry.installedSize)" }
$binarySum = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($binarySum -ne $entry.binarySha256) { throw "ffmpeg.exe SHA-256 is $binarySum, the catalogue says $($entry.binarySha256)" }
Write-Host "kept $($entry.binary): $($binary.Length) bytes, SHA-256 matches the catalogue"
& $target -hide_banner -version | Select-Object -First 2
if ($env:GITHUB_ENV) { "FFMPEG_PATH=$target" | Add-Content $env:GITHUB_ENV -Encoding utf8 }
$target
