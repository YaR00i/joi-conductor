# Extract a clean mono WAV from a cutscene for GPT-SoVITS.
# Usage:
#   .\scripts\extract-voice-ref.ps1 -InputFile "D:\cutscene.mp4" -Start "00:00:12.5" -Duration 8
param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [string]$Start = "00:00:00",
  [double]$Duration = 8,
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutFile) {
  $OutFile = Join-Path $root "voice-refs\hu-tao\ref.wav"
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Write-Error "ffmpeg не найден в PATH. Установи ffmpeg и повтори."
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutFile) | Out-Null

& ffmpeg -y -ss $Start -i $InputFile -t $Duration -vn -ac 1 -ar 40000 $OutFile
Write-Host "OK -> $OutFile"
Write-Host "Дочисти в Audacity при необходимости, затем укажи текст фразы в настройках SoVITS."
