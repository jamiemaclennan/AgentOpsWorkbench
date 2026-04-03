#!/usr/bin/env pwsh
param(
    [string]$OutputPath = $(Join-Path $PWD 'agent-ops-workbench-bundle.zip')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$pluginName = 'agent-ops-workbench'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$pluginDir = $pluginRoot

$marketplacePath = Join-Path $HOME '.agents/plugins/marketplace.json'
if (-not (Test-Path $marketplacePath)) {
    throw "Marketplace file not found: $marketplacePath"
}

$marketplace = Get-Content -Raw -Path $marketplacePath | ConvertFrom-Json
$entry = $marketplace.plugins | Where-Object { $_.name -eq $pluginName } | Select-Object -First 1
if (-not $entry) {
    throw "Marketplace entry '$pluginName' not found in $marketplacePath"
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-ops-workbench-export-" + [guid]::NewGuid().ToString('N'))
$bundleRoot = Join-Path $stagingRoot 'bundle'
$pluginTargetParent = Join-Path $bundleRoot 'plugins'
$pluginTarget = Join-Path $pluginTargetParent $pluginName
New-Item -ItemType Directory -Force -Path $pluginTargetParent | Out-Null
Copy-Item -LiteralPath $pluginDir -Destination $pluginTarget -Recurse -Force

$entry | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $bundleRoot 'marketplace-entry.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'import-plugin.ps1') -Destination (Join-Path $bundleRoot 'import-plugin.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'import-plugin.sh') -Destination (Join-Path $bundleRoot 'import-plugin.sh') -Force

$manifest = [pscustomobject]@{
    pluginName = $pluginName
    exportedAt = (Get-Date).ToString('o')
    pluginRelativePath = "plugins/$pluginName"
    marketplaceEntryFile = 'marketplace-entry.json'
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $bundleRoot 'bundle-manifest.json') -Encoding UTF8

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}
if (Test-Path $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

[System.IO.Compression.ZipFile]::CreateFromDirectory($bundleRoot, $OutputPath)
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Output "Created bundle: $OutputPath"

