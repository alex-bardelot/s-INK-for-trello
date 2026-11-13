# Build the plugin and copy the .snplg package to the Supernote Partner
# app's MyStyle sync folder, so it syncs to the tablet.
#
# Usage: powershell -ExecutionPolicy Bypass -File .\deployPlugin.ps1 [-SkipBuild]
#
# The MyStyle folder is found under
#   %APPDATA%\com.ratta\supernote_partner\<account id>\Supernote\MyStyle
# Set SUPERNOTE_MYSTYLE_DIR to override it.

param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$outputs = Join-Path $root 'build\outputs'
$started = Get-Date

if (-not $SkipBuild) {
    Write-Host '=== Building the plugin ===' -ForegroundColor Blue
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'buildPlugin.ps1')
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

$package = Get-ChildItem $outputs -Filter *.snplg -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $package) {
    Write-Host "No .snplg package found in $outputs" -ForegroundColor Red
    exit 1
}
if (-not $SkipBuild -and $package.LastWriteTime -lt $started) {
    Write-Host "$($package.Name) was not rebuilt; the build probably failed" -ForegroundColor Red
    exit 1
}

if ($env:SUPERNOTE_MYSTYLE_DIR) {
    $targets = @($env:SUPERNOTE_MYSTYLE_DIR)
} else {
    $partner = Join-Path $env:APPDATA 'com.ratta\supernote_partner'
    $targets = @(Get-ChildItem $partner -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'Supernote\MyStyle' } |
        Where-Object { Test-Path $_ })
}
if ($targets.Count -eq 0) {
    Write-Host 'No MyStyle folder found; set SUPERNOTE_MYSTYLE_DIR' -ForegroundColor Red
    exit 1
}

foreach ($dir in $targets) {
    Copy-Item $package.FullName $dir -Force
    Write-Host "Copied $($package.Name) to $dir" -ForegroundColor Green
    Get-ChildItem $dir -Filter *.snplg | Select-Object Name, Length, LastWriteTime |
        Format-Table -AutoSize | Out-String | Write-Host
}
exit 0
