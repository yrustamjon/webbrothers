$ErrorActionPreference = 'Stop'
try {
    $agentHome = Join-Path $env:LOCALAPPDATA 'WebBrothers Agent'
    New-Item -ItemType Directory -Force -Path $agentHome | Out-Null
    # Restrict secrets to the current Windows user; no elevated account needed.
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $agentHome -AclObject $acl
    Write-Host 'WebBrothers Agent — joriy foydalanuvchi. Toʻxtatish: Ctrl+C.'
    Write-Host ('Versiya: ' + (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim())
    Write-Host '1 — Agentni ishga tushirish; 2 — Yangilanishni yuklab olish'
    $choice = Read-Host 'Tanlov [1/2]'
    if ($choice -eq '2') {
        Start-Process 'https://github.com/yrustamjon/webbrothers/releases/latest/download/bmp-agent-windows-amd64-setup.exe'
        Write-Host 'Yuklangan installerni qayta ishga tushiring. Ulangan qurilma sozlamalari saqlanadi.'
        exit 0
    }
    if ($choice -ne '1') { exit 0 }
    $serverFile = Join-Path $agentHome 'server.txt'
    if (Test-Path -LiteralPath $serverFile) { $server = (Get-Content -LiteralPath $serverFile -Raw).Trim() }
    else { $server = Read-Host 'Saytning HTTPS manzili (masalan https://localhost:8443)' }
    $uri = $null
    if (-not [Uri]::TryCreate($server, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'HTTPS server manzili kerak.' }
    Write-Host "Server: $server"
    if ((Read-Host 'Brauzer/profillarni aniqlash va tarixni oʻqishga rozimisiz? [ha/yoʻq]') -ne 'ha') { exit 0 }
    Set-Content -LiteralPath $serverFile -Value $server -Encoding UTF8
    $secretFile = Join-Path $agentHome 'passphrase.dpapi'
    if (-not (Test-Path -LiteralPath $secretFile)) {
        $bytes = New-Object byte[] 48
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = [Convert]::ToBase64String($bytes) | ConvertTo-SecureString -AsPlainText -Force
        $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding ASCII
    }
    $secret = Get-Content -LiteralPath $secretFile -Raw | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $env:BROWSER_AGENT_KEY_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $ca = Join-Path $agentHome 'ca.pem'
    if (Test-Path -LiteralPath $ca) { $env:SSL_CERT_FILE = $ca }
    $identity = Join-Path $agentHome 'identity.enc'
    $binary = Join-Path $PSScriptRoot 'browser-agent.exe'
    $scopes = 'browser.discovery,profile.discovery,history.read'
    if (-not (Test-Path -LiteralPath $identity)) {
        Write-Host 'Ulash kodini saytdagi Qurilma ulash boʻlimida tasdiqlang.'
        & $binary --action pair --server $server --state $identity --scopes $scopes
        if ($LASTEXITCODE -ne 0) { throw 'Qurilma ulanmadi.' }
    }
    & $binary --action run --server $server --state $identity --scopes $scopes
    if ($LASTEXITCODE -ne 0) { throw 'Agent toʻxtadi.' }
} catch {
    Write-Host 'Agent ishga tushmadi. HTTPS manzili, sertifikat va ulash ruxsatlarini tekshiring.'
    Read-Host 'Yopish uchun Enter'
    exit 1
} finally {
    Remove-Item Env:BROWSER_AGENT_KEY_PASSPHRASE -ErrorAction SilentlyContinue
}
