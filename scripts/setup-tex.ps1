# Project-local, verified MiKTeX bootstrap. Never changes machine/user PATH.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot '.tools'
$setupDirectory = Join-Path $toolsDirectory 'miktex-setup'
$setupExecutable = Join-Path $setupDirectory 'miktexsetup_standalone.exe'
$texDirectory = Join-Path $toolsDirectory 'miktex'
$texBin = Join-Path $texDirectory 'texmfs\install\miktex\bin\x64'
$miktexExecutable = Join-Path $texBin 'miktex.exe'
$repositoryDirectory = Join-Path $toolsDirectory 'miktex-repository'

New-Item -ItemType Directory -Force -Path $setupDirectory | Out-Null
if (-not (Test-Path -LiteralPath $setupExecutable)) {
    $archivePath = Join-Path $toolsDirectory 'miktex-setup.zip'
    $setupUri = 'https://mirrors.mit.edu/CTAN/systems/win32/miktex/setup/windows-x64/miktexsetup-5.5.0+1763023-x64.zip'
    Invoke-WebRequest -Uri $setupUri -OutFile $archivePath
    $expectedSha = '0571e90f6d94353089b4f189fd82a532f9fe559a388c7e7f1102b14b3c1ae27d'
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha) {
        throw 'MiKTeX setup checksum mismatch; no executable has been launched.'
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $setupDirectory -Force
}
if (-not (Test-Path -LiteralPath $miktexExecutable)) {
    & $setupExecutable --quiet "--local-package-repository=$repositoryDirectory" --package-set=essential download
    if ($LASTEXITCODE -ne 0) { throw 'MiKTeX package download failed' }
    & $setupExecutable --quiet "--local-package-repository=$repositoryDirectory" --package-set=essential "--portable=$texDirectory" --modify-path=no install
    if ($LASTEXITCODE -ne 0) { throw 'MiKTeX portable install failed' }
}
& (Join-Path $texBin 'initexmf.exe') '--set-config-value=[MPM]AutoInstall=1'
if ($LASTEXITCODE -ne 0) { throw 'MiKTeX configuration failed' }
# Run this script alone: compilation while package installation runs can contend
# for MiKTeX's files. Only install packages which are not already present.
foreach ($packageId in @('cm','latex-fonts','standalone','preview','xkeyval','amsmath','amsfonts','babel-english')) {
    $installed = & $miktexExecutable packages info '--template={isInstalled}' $packageId
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect package $packageId" }
    if ($installed.Trim() -ne 'true') {
        & $miktexExecutable packages install $packageId
        if ($LASTEXITCODE -ne 0) { throw "Cannot install package $packageId" }
    }
}
& $miktexExecutable formats build latex
if ($LASTEXITCODE -ne 0) { throw 'LaTeX format initialization failed' }
& (Join-Path $texBin 'dvisvgm.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'dvisvgm verification failed' }
Write-Output "Project-local TeX ready: $texBin"
