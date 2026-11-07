<#
  The One MSP Phone desktop - build and sign the Windows installer in one go (7 Nov 2026).

    .\desktop\build\release.ps1                    # build + sign at the version in desktop\package.json
    .\desktop\build\release.ps1 -Version 0.3.1     # bump desktop\package.json first, then build + sign
    .\desktop\build\release.ps1 -Unsigned          # local test build only - never give this one out (Avast flags it)

  Signing is Azure Trusted Signing, as for the Windows agent: account aemsystems-signing, profile aemsystems-public
  (desktop\electron-builder.signed.js). It uses your own Azure sign-in, so run Connect-AzAccount in this window first
  (the script asks if there's no sign-in). The script stops unless both the installer and the app inside it come out
  Authenticode-Valid.

  Output: desktop\release\The One MSP Phone Setup <version>.exe
#>
param([string]$Version, [switch]$Unsigned)
$ErrorActionPreference = 'Stop'
$desktop = Split-Path $PSScriptRoot -Parent
$root = Split-Path $desktop -Parent

function Run([string]$what, [scriptblock]$cmd) {
  Write-Host "== $what" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE) { throw "$what failed (exit $LASTEXITCODE)" }
}

if ($Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 0.3.1" }
  Push-Location $desktop
  try { Run "Set version $Version" { npm version $Version --no-git-tag-version --allow-same-version } } finally { Pop-Location }
}
$ver = (Get-Content (Join-Path $desktop 'package.json') -Raw | ConvertFrom-Json).version

if (-not $Unsigned) {
  if (-not (Get-Module -ListAvailable -Name Az.Accounts)) { throw 'Az.Accounts is not installed: Install-Module Az.Accounts -Scope CurrentUser' }
  Import-Module Az.Accounts
  if (-not (Get-AzContext)) { Connect-AzAccount | Out-Null }
  Write-Host "Signing as $((Get-AzContext).Account.Id)"
}

Push-Location $root
try {
  if (-not (Test-Path (Join-Path $root 'node_modules'))) { Run 'Install app packages' { npm ci } }
  Run 'Web export of the app' { npm run export:web }
} finally { Pop-Location }

Push-Location $desktop
try {
  if (-not (Test-Path (Join-Path $desktop 'node_modules'))) { Run 'Install desktop packages' { npm ci } }
  if ($Unsigned) { Run "Build $ver (UNSIGNED)" { npm run dist:win } }
  else { Run "Build and sign $ver" { npm run dist:win:signed } }
} finally { Pop-Location }

$setup = Join-Path $desktop "release\The One MSP Phone Setup $ver.exe"
$app = Join-Path $desktop 'release\win-unpacked\The One MSP Phone.exe'
foreach ($f in $setup, $app) { if (-not (Test-Path -LiteralPath $f)) { throw "Missing $f" } }

if ($Unsigned) {
  Write-Warning "UNSIGNED build: $setup - for testing on this PC only."
  return
}
$bad = @()
foreach ($f in $setup, $app) {
  $sig = Get-AuthenticodeSignature -LiteralPath $f
  Write-Host ("{0}: {1} ({2})" -f (Split-Path $f -Leaf), $sig.Status, $sig.SignerCertificate.Subject)
  if ($sig.Status -ne 'Valid') { $bad += $f }
}
if ($bad) { throw "Not signed properly - don't ship: $($bad -join ', ')" }
Write-Host ''
Write-Host "Ready: $setup" -ForegroundColor Green
Write-Host ("SHA256 {0}" -f (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash)
