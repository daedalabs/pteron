param([switch]$Portable,[switch]$Installer,[string]$ArtifactName='',[switch]$IncludeLegacyTex)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $taskRoot
$buildPython = if ($env:PTERON_BUILD_PYTHON) {
    (Resolve-Path -LiteralPath $env:PTERON_BUILD_PYTHON).Path
} elseif (Test-Path -LiteralPath (Join-Path $taskRoot '.venv\Scripts\python.exe')) {
    (Resolve-Path -LiteralPath (Join-Path $taskRoot '.venv\Scripts\python.exe')).Path
}
function Invoke-BuildPython([string[]]$PythonArgs) {
    if ($buildPython) {
        & $buildPython @PythonArgs
    } else {
        uv run python @PythonArgs
    }
}
if ($IncludeLegacyTex -and (-not (Test-Path -LiteralPath '.tools/miktex/texmfs/install/miktex/bin/x64/latex.exe'))) {
    & (Join-Path $PSScriptRoot 'setup-tex.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'TeX setup failed' }
}
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Application build failed' }
Invoke-BuildPython -PythonArgs @('-m','PyInstaller','--noconfirm','--onedir','--name','pteron-worker','--distpath','artifacts/standalone-runtime','--workpath','artifacts/worker-build','--specpath','artifacts','--paths','.','--collect-all','manim','--collect-all','manimpango','--collect-all','av','--hidden-import','renderer.svg_normalize','--hidden-import','renderer.runtime','renderer/worker.py')
if ($LASTEXITCODE -ne 0) { throw 'Worker build failed' }
Invoke-BuildPython -PythonArgs @('scripts/collect-notices.py')
if ($LASTEXITCODE -ne 0) { throw 'Python notice collection failed' }
node scripts/collect-notices.mjs
if ($LASTEXITCODE -ne 0) { throw 'Application notice collection failed' }
if ($IncludeLegacyTex) {
    Invoke-BuildPython -PythonArgs @('scripts/prepare-portable-tex.py')
    if ($LASTEXITCODE -ne 0) { throw 'Offline TeX staging failed' }
    Invoke-BuildPython -PythonArgs @('scripts/verify-portable-tex.py')
    if ($LASTEXITCODE -ne 0) { throw 'Relocated TeX verification failed' }
}
if ($Installer) {
    if (-not $env:ELECTRON_BUILDER_COMPRESSION_LEVEL) { $env:ELECTRON_BUILDER_COMPRESSION_LEVEL = '3' }
    node scripts/package-installer.mjs $ArtifactName
} elseif ($Portable) {
    if (-not $env:ELECTRON_BUILDER_COMPRESSION_LEVEL) { $env:ELECTRON_BUILDER_COMPRESSION_LEVEL = '3' }
    node scripts/package-portable.mjs $ArtifactName
} else {
    node node_modules/electron-builder/cli.js --dir --win --x64
}
if ($LASTEXITCODE -ne 0) { throw 'Standalone candidate build failed' }
Write-Output 'Local standalone candidate: artifacts/standalone/win-unpacked/pteron.exe'
$targetExe = if ($Installer) {
    if ($ArtifactName) { "artifacts/standalone/$ArtifactName" } else { 'artifacts/standalone/pteron-0.1.0-setup.exe' }
} elseif ($Portable) {
    if ($ArtifactName) { "artifacts/standalone/$ArtifactName" } else { 'artifacts/standalone/pteron-0.1.0-portable.exe' }
} else {
    'artifacts/standalone/win-unpacked/pteron.exe'
}
if ($Installer) {
    Write-Output "Installer executable: $targetExe"
} elseif ($Portable) {
    Write-Output "Portable executable: $targetExe"
}

$cert = Get-ChildItem Cert:\LocalMachine\My, Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
    Where-Object { ($_.Subject -like "*CN=Pteron*" -or $_.Subject -like "*CN=LocalDevApp*") -and $_.HasPrivateKey } |
    Select-Object -First 1

if ($cert -and (Test-Path -LiteralPath $targetExe)) {
    Write-Output "Applying Authenticode signature using '$($cert.Subject)'..."
    try {
        $sig = Set-AuthenticodeSignature -FilePath $targetExe -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
        Write-Output "Signature status: $($sig.Status)"
    } catch {
        Write-Warning "Failed to sign ${targetExe}: $_"
    }
} else {
    Write-Output 'This is an unsigned development candidate, not a completed release audit.'
}
