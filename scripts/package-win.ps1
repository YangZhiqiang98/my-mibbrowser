$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot
$RepoRootPath = $RepoRoot.Path
$PackageProxy = [Environment]::GetEnvironmentVariable('PACKAGE_PROXY')
$ElectronMirror = [Environment]::GetEnvironmentVariable('ELECTRON_MIRROR')
$ElectronBuilderBinariesMirror = [Environment]::GetEnvironmentVariable('ELECTRON_BUILDER_BINARIES_MIRROR')

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [scriptblock] $Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command

  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Remove-BuildDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string] $RelativePath
  )

  $target = Join-Path $RepoRootPath $RelativePath
  $fullTarget = [System.IO.Path]::GetFullPath($target)

  if (-not $fullTarget.StartsWith($RepoRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside repo: $fullTarget"
  }

  if (Test-Path -LiteralPath $fullTarget) {
    Remove-Item -LiteralPath $fullTarget -Recurse -Force
  }
}

function Set-PackagingMirrors {
  if ([string]::IsNullOrWhiteSpace($ElectronMirror)) {
    $ElectronMirror = 'https://npmmirror.com/mirrors/electron/'
  }

  if ([string]::IsNullOrWhiteSpace($ElectronBuilderBinariesMirror)) {
    $ElectronBuilderBinariesMirror = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  }

  Write-Host "==> Electron mirror: $ElectronMirror"
  Write-Host "==> electron-builder binaries mirror: $ElectronBuilderBinariesMirror"
  $env:ELECTRON_MIRROR = $ElectronMirror
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = $ElectronBuilderBinariesMirror
}

function Set-PackagingProxy {
  if ([string]::IsNullOrWhiteSpace($PackageProxy)) {
    Write-Host "==> Packaging proxy: not set"
    Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
    Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
    Remove-Item Env:http_proxy -ErrorAction SilentlyContinue
    Remove-Item Env:https_proxy -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_proxy -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_https_proxy -ErrorAction SilentlyContinue
    Remove-Item Env:ELECTRON_GET_USE_PROXY -ErrorAction SilentlyContinue
    return
  }

  Write-Host "==> Packaging proxy: $PackageProxy"
  $env:HTTP_PROXY = $PackageProxy
  $env:HTTPS_PROXY = $PackageProxy
  $env:http_proxy = $PackageProxy
  $env:https_proxy = $PackageProxy
  $env:npm_config_proxy = $PackageProxy
  $env:npm_config_https_proxy = $PackageProxy
  $env:ELECTRON_GET_USE_PROXY = '1'
}

Set-PackagingMirrors
Set-PackagingProxy
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Write-Host "==> Code signing auto discovery: disabled"

Write-Host "==> Cleaning previous build artifacts"
Remove-BuildDirectory "out"
Remove-BuildDirectory "dist"

Invoke-CheckedCommand "Type checking" { npm run typecheck }
Invoke-CheckedCommand "Linting" { npm run lint }
Invoke-CheckedCommand "Running tests" { npm test }
Invoke-CheckedCommand "Building Electron app" { npm run build }
Invoke-CheckedCommand "Packaging Windows x64 NSIS installer" { node .\node_modules\electron-builder\cli.js --win --x64 --publish never }

Write-Host ""
Write-Host "Windows package complete. Artifacts are in dist/."
