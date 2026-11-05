$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../installers/windows/launch.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $source), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Launcher syntax failed' }
$function = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-AgentLocalSecret'}, $true)
if (-not $function) { throw 'Secret reader missing' }
Invoke-Expression $function.Extent.Text
$directory = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory | Out-Null
try {
    $file = Join-Path $directory 'passphrase.dpapi'
    $expected = 'synthetic-launcher-key-123456789'
    $secret = ConvertTo-SecureString -String $expected -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secret
    foreach ($suffix in @("`r`n", "`n", '')) {
        [IO.File]::WriteAllText($file, $encrypted + $suffix)
        $before = [IO.File]::ReadAllText($file)
        $restored = Read-AgentLocalSecret $file
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored)
        try {
            if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -cne $expected) { throw 'Secret changed' }
        } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ([IO.File]::ReadAllText($file) -cne $before) { throw 'Existing file changed' }
    }
    [IO.File]::WriteAllText($file, "`r`n")
    $rejected = $false
    try { Read-AgentLocalSecret $file | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Empty key accepted' }
    Write-Host 'PASS: launcher key CRLF/LF/plain roundtrip, unchanged state, empty-key rejection'
} finally { Remove-Item -LiteralPath $directory -Recurse -Force }
