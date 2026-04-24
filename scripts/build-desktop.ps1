param(
  [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("scripts/build-desktop.mjs")
if ($SkipFrontendInstall) {
  $scriptArgs += "--skip-frontend-install"
}

Push-Location $repoRoot
try {
  & node @scriptArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Cross-platform desktop build failed."
  }
}
finally {
  Pop-Location
}
