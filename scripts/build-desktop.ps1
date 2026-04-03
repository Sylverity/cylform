param(
  [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$uiDir = Join-Path $repoRoot "desktop\src-ui"
$rootExe = Join-Path $repoRoot "CYLview-NG.exe"
$releaseExe = Join-Path $repoRoot "target\release\cylview-ng.exe"

Write-Host "==> Building CYLview-NG desktop app"
Write-Host "Repo root: $repoRoot"

Push-Location $uiDir
try {
  if (-not $SkipFrontendInstall) {
    Write-Host "==> Installing frontend dependencies"
    npm install
  }

  Write-Host "==> Building frontend bundle"
  npm run build

  if (Test-Path $releaseExe) {
    Remove-Item -LiteralPath $releaseExe -Force
  }
  if (Test-Path $rootExe) {
    Remove-Item -LiteralPath $rootExe -Force
  }

  Write-Host "==> Building standalone desktop release"
  if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Pop-Location
    Push-Location $repoRoot
    try {
      cargo build --release -p cylview-desktop --bin cylview-ng
    }
    finally {
      Pop-Location
      Push-Location $uiDir
    }
  }
  else {
    throw "Cargo is required to build the desktop executable."
  }
}
finally {
  Pop-Location
}

if (-not (Test-Path $releaseExe)) {
  throw "Expected release exe was not found at '$releaseExe'."
}

Copy-Item -LiteralPath $releaseExe -Destination $rootExe -Force

Write-Host "==> Refreshed root executable"
Write-Host "Standalone exe: $releaseExe"
Write-Host "Repo-root copy: $rootExe"
