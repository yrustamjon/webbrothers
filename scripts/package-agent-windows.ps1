param(
    [Parameter(Mandatory=$true)][string]$Version,
    [Parameter(Mandatory=$true)][string]$BinaryPath,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') { throw 'Yaroqsiz versiya' }
$root = Split-Path -Parent $PSScriptRoot
$binary = (Resolve-Path -LiteralPath $BinaryPath).Path
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($compiler) { $iscc = $compiler.Source }
else { $iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe' }
if (-not (Test-Path -LiteralPath $iscc)) { throw 'Inno Setup 6 (ISCC.exe) kerak.' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'browser-agent.exe')
    Copy-Item -LiteralPath (Join-Path $root 'installers\windows\launch.ps1') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'installers\windows\launch.cmd') -Destination $stage
    Set-Content -LiteralPath (Join-Path $stage 'VERSION') -Value $Version -Encoding ASCII
    & $iscc "/DVersion=$Version" "/DSourceDir=$stage" "/DOutputDir=$output" (Join-Path $root 'installers\windows\agent.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer yigʻilmadi.' }
    Write-Host 'Imzosiz sinov installer; Authenticode sertifikati alohida talab qilinadi.'
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
