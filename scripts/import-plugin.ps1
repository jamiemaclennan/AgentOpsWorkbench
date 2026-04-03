#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)]
    [string]$BundlePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$BundlePath = [System.IO.Path]::GetFullPath($BundlePath)
if (-not (Test-Path $BundlePath)) {
    throw "Bundle not found: $BundlePath"
}

$extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-ops-workbench-import-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
[System.IO.Compression.ZipFile]::ExtractToDirectory($BundlePath, $extractRoot)

$manifestPath = Join-Path $extractRoot 'bundle-manifest.json'
$entryPath = Join-Path $extractRoot 'marketplace-entry.json'
if (-not (Test-Path $manifestPath)) {
    throw "Bundle manifest missing: $manifestPath"
}
if (-not (Test-Path $entryPath)) {
    throw "Marketplace entry missing: $entryPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$entry = Get-Content -Raw -Path $entryPath | ConvertFrom-Json
$pluginName = [string]$manifest.pluginName
$sourcePluginDir = Join-Path $extractRoot $manifest.pluginRelativePath
if (-not (Test-Path $sourcePluginDir)) {
    throw "Plugin payload missing: $sourcePluginDir"
}

$pluginsDir = Join-Path $HOME 'plugins'
$targetPluginDir = Join-Path $pluginsDir $pluginName
New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
if (Test-Path $targetPluginDir) {
    Remove-Item -LiteralPath $targetPluginDir -Recurse -Force
}
Copy-Item -LiteralPath $sourcePluginDir -Destination $targetPluginDir -Recurse -Force

$agentsPluginsDir = Join-Path $HOME '.agents/plugins'
$marketplacePath = Join-Path $agentsPluginsDir 'marketplace.json'
New-Item -ItemType Directory -Force -Path $agentsPluginsDir | Out-Null

if (Test-Path $marketplacePath) {
    $marketplace = Get-Content -Raw -Path $marketplacePath | ConvertFrom-Json
} else {
    $marketplace = [pscustomobject]@{
        name = 'local'
        interface = [pscustomobject]@{ displayName = 'Local' }
        plugins = @()
    }
}

$plugins = @($marketplace.plugins)
$filtered = @($plugins | Where-Object { $_.name -ne $pluginName })
$filtered += $entry
$marketplace.plugins = $filtered

$marketplace | ConvertTo-Json -Depth 10 | Set-Content -Path $marketplacePath -Encoding UTF8
Remove-Item -LiteralPath $extractRoot -Recurse -Force

Write-Output "Installed plugin to: $targetPluginDir"
Write-Output "Updated marketplace: $marketplacePath"

