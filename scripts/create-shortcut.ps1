# Creates / refreshes Windows shortcuts with the app icon.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$ico = Join-Path $root "public\icon.ico"

if (-not (Test-Path -LiteralPath $ico)) {
  Write-Error "Missing icon: $ico"
}

# Resolve launcher without hardcoding Cyrillic filename (encoding-safe).
$bat = Get-ChildItem -LiteralPath $root -File -Filter "*.bat" |
  Where-Object {
    try {
      Select-String -LiteralPath $_.FullName -Pattern "launch-window\.mjs" -Quiet
    } catch {
      $false
    }
  } |
  Select-Object -First 1

if (-not $bat) {
  Write-Error "Launcher .bat not found in $root"
}

function New-JoiShortcut([string]$lnkPath) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnkPath)
  $sc.TargetPath = $bat.FullName
  $sc.WorkingDirectory = $root
  $sc.IconLocation = "$ico,0"
  $sc.Description = "JOI Conductor"
  $sc.WindowStyle = 1
  $sc.Save()
  Write-Host "Shortcut: $lnkPath"
}

New-JoiShortcut (Join-Path $root "JOI Conductor.lnk")

$desktop = [Environment]::GetFolderPath("Desktop")
if ($desktop -and (Test-Path -LiteralPath $desktop)) {
  New-JoiShortcut (Join-Path $desktop "JOI Conductor.lnk")
}

Write-Host "Done. Launcher:" $bat.Name
