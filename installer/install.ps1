# Torya Bridge installer (Windows).
#
# Env:
#   TORYA_EXTENSION_ID   Chrome extension ID to allowlist. Required.
#   TORYA_LOCAL_DEV      Set to "1" to copy from .\bridge\dist instead of downloading.
#   TORYA_VERSION        Pin a specific release (default: latest).

$ErrorActionPreference = "Stop"

$Repo    = "su-record/torya"
$AppName = "com.torya.bridge"
$ExtId   = $env:TORYA_EXTENSION_ID
if (-not $ExtId) { throw "TORYA_EXTENSION_ID is required (Chrome extension ID)." }

$BaseDir = Join-Path $env:LOCALAPPDATA "Torya"
$BinPath = Join-Path $BaseDir "torya-bridge.exe"
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

if ($env:TORYA_LOCAL_DEV -eq "1") {
    $Src = ".\bridge\dist\torya-bridge.exe"
    if (-not (Test-Path $Src)) {
        throw "Local dev mode but $Src not built."
    }
    Copy-Item $Src $BinPath -Force
    Write-Host "Copied local dev binary to $BinPath"
} else {
    $Version = if ($env:TORYA_VERSION) { $env:TORYA_VERSION } else { "latest" }
    $UrlBase = if ($Version -eq "latest") {
        "https://github.com/$Repo/releases/latest/download"
    } else {
        "https://github.com/$Repo/releases/download/$Version"
    }
    $Url = "$UrlBase/torya-bridge-windows-amd64.exe"
    Write-Host "Downloading bridge from $Url"
    Invoke-WebRequest -Uri $Url -OutFile $BinPath
}

$ManifestPath = Join-Path $BaseDir "$AppName.json"
$EscapedPath  = $BinPath -replace '\\', '\\'
@"
{
  "name": "$AppName",
  "description": "Torya Native Messaging host",
  "path": "$EscapedPath",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ExtId/"]
}
"@ | Set-Content -Path $ManifestPath -Encoding UTF8

$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$AppName"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(default)" -Value $ManifestPath

Write-Host ""
Write-Host "Torya Bridge installed."
Write-Host "Manifest: $ManifestPath"
Write-Host "Binary:   $BinPath"
Write-Host ""
Write-Host "Next: reload the Torya extension in chrome://extensions"
