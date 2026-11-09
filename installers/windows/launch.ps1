$ErrorActionPreference = 'Stop'

function Read-AgentInput([string]$Prompt) {
    try {
        if ([Console]::IsInputRedirected) {
            Write-Host ($Prompt + ': ') -NoNewline
            $answer = [Console]::ReadLine()
            if ($null -eq $answer) { throw [OperationCanceledException]::new('Input closed') }
        } else {
            $answer = Read-Host $Prompt
        }
        return $answer.Trim()
    } catch {
        # EOF and cancellation close the menu rather than spinning on empty input.
        throw [OperationCanceledException]::new('Input closed')
    }
}

function Assert-AgentServer([string]$Server) {
    $uri = $null
    if (-not [Uri]::TryCreate($Server, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or -not $uri.Host -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
        throw 'HTTPS server manzili kerak.'
    }
}

function Set-AgentServer([string]$AgentHome) {
    $server = Read-AgentInput 'Yangi HTTPS server manzili (bekor qilish uchun boʻsh qoldiring)'
    if ([string]::IsNullOrWhiteSpace($server)) {
        Write-Host 'Server manzili oʻzgartirilmadi.'
        return
    }
    Assert-AgentServer $server
    Set-Content -LiteralPath (Join-Path $AgentHome 'server.txt') -Value $server -Encoding UTF8
    Write-Host 'Server manzili saqlandi. Boshqa serverga oʻtsangiz 3 — qayta ulashni tanlang. Mavjud identifikator oʻchirilmaydi.'
}

function Read-AgentLocalSecret([string]$SecretFile) {
    # Set-Content appends CRLF. DPAPI expects the hexadecimal blob without whitespace.
    try {
        $encryptedSecret = (Get-Content -LiteralPath $SecretFile -Raw).Trim()
        if ([string]::IsNullOrWhiteSpace($encryptedSecret)) { throw 'Empty local key' }
        return ConvertTo-SecureString -String $encryptedSecret
    } catch {
        Write-Host 'Mahalliy kalit ochilmadi: Windows hisobi va passphrase.dpapi faylini tekshiring. Mavjud identifikator saqlandi.'
        throw
    }
}

function Invoke-AgentSession([string]$AgentHome, [string]$Binary, [string]$Choice) {
    $serverFile = Join-Path $AgentHome 'server.txt'
    if (Test-Path -LiteralPath $serverFile) { $server = (Get-Content -LiteralPath $serverFile -Raw).Trim() }
    else {
        $server = Read-AgentInput 'Saytning HTTPS manzili [https://localhost:8443]'
        if ([string]::IsNullOrWhiteSpace($server)) { $server = 'https://localhost:8443' }
    }
    Assert-AgentServer $server
    Write-Host "Server: $server"
    if ((Read-AgentInput 'Brauzer/profillarni aniqlash va tarixni oʻqishga rozimisiz? [ha/yoʻq]') -ne 'ha') {
        Write-Host 'Rozilik berilmadi. Agent ishga tushirilmadi.'
        return
    }
    Set-Content -LiteralPath $serverFile -Value $server -Encoding UTF8
    $secretFile = Join-Path $AgentHome 'passphrase.dpapi'
    if (-not (Test-Path -LiteralPath $secretFile)) {
        $bytes = New-Object byte[] 48
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = [Convert]::ToBase64String($bytes) | ConvertTo-SecureString -AsPlainText -Force
        $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding ASCII
    }
    $secret = Read-AgentLocalSecret $secretFile
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $env:BROWSER_AGENT_KEY_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $ca = Join-Path $AgentHome 'ca.pem'
    if (Test-Path -LiteralPath $ca) { $env:SSL_CERT_FILE = $ca }
    $identity = Join-Path $AgentHome 'identity.enc'
    $scopes = 'browser.discovery,profile.discovery,history.read'
    if (-not (Test-Path -LiteralPath $identity) -or $Choice -eq '3') {
        if ((Read-AgentInput 'Login va saqlangan parollarni boshqarishga rozimisiz? [ha/yoʻq]') -eq 'ha') { $scopes += ',login.inventory' }
        if ((Read-AgentInput 'Qurilmaning jami trafik baytlarini olishga rozimisiz? [ha/yoʻq]') -eq 'ha') { $scopes += ',traffic.aggregate' }
        if ((Read-AgentInput 'Joriy hisob tarmoq ulanishlari metadata sini olishga rozimisiz? [ha/yoʻq]') -eq 'ha') { $scopes += ',traffic.connections' }
        if ((Read-AgentInput 'Ixtiyoriy kengaytmadan HTTP domen/metod/status olishga rozimisiz? [ha/yoʻq]') -eq 'ha') { $scopes += ',traffic.http' }
        $pairAction = 'pair'
        if ($Choice -eq '3') { $pairAction = 're-pair' }
        Write-Host 'Ulash kodini saytdagi Qurilma ulash boʻlimida aynan shu ruxsatlar bilan tasdiqlang.'
        # Go preserves the existing identity if re-pair is cancelled or fails.
        & $Binary --action $pairAction --server $server --state $identity --scopes $scopes
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $identity)) { throw 'Qurilma ulanmadi.' }
    }
    if ($Choice -eq '5') { & $Binary --action bridge-info --state $identity; return }
    Write-Host 'Agent ishlamoqda. Toʻxtatish: Ctrl+C. Toʻxtagach menyuga qaytiladi.'
    & $Binary --action run --server $server --state $identity --scopes $scopes
    if ($LASTEXITCODE -ne 0) { throw 'Agent toʻxtadi.' }
}

function Start-AgentMenu([string]$AgentHome, [string]$Binary) {
    while ($true) {
        $previousCA = $env:SSL_CERT_FILE
        try {
            Write-Host ''
            Write-Host '1 — Agentni ishga tushirish'
            Write-Host '2 — Yangilanishni yuklab olish'
            Write-Host '3 — Ruxsatlarni yangilash / qayta ulash'
            Write-Host '4 — Server manzilini oʻzgartirish'
            Write-Host '5 — HTTP kengaytmasi ulash kaliti'
            Write-Host '0 — Chiqish'
            $choice = Read-AgentInput 'Tanlov [1/2/3/4/5/0]'
            if ($choice -eq '0') { break }
            if ($choice -eq '2') {
                Start-Process 'https://github.com/yrustamjon/webbrothers/releases/latest/download/bmp-agent-windows-amd64-setup.exe'
                Write-Host 'Yuklangan installerni ishga tushiring. Ulangan qurilma sozlamalari saqlanadi.'
                continue
            }
            if ($choice -eq '4') {
                Set-AgentServer $AgentHome
                continue
            }
            if ($choice -ne '1' -and $choice -ne '3' -and $choice -ne '5') {
                Write-Host 'Menyudan 1, 2, 3, 4 yoki 0 ni tanlang.'
                continue
            }
            Invoke-AgentSession -AgentHome $AgentHome -Binary $Binary -Choice $choice
            Write-Host 'Agent toʻxtadi. Kerakli amalni menyudan tanlang.'
        } catch [OperationCanceledException] {
            Write-Host 'Kiritish tugadi. Agent yopildi.'
            break
        } catch {
            # Never dump exceptions or secrets. Retry requires a fresh menu choice.
            Write-Host 'Amal bajarilmadi. HTTPS manzili, sertifikat, internet va ulash ruxsatlarini tekshiring.'
            Write-Host 'Qayta urinish uchun 1 yoki 3; server manzilini tuzatish uchun 4 ni tanlang.'
        } finally {
            Remove-Item Env:BROWSER_AGENT_KEY_PASSPHRASE -ErrorAction SilentlyContinue
            if ($null -eq $previousCA) { Remove-Item Env:SSL_CERT_FILE -ErrorAction SilentlyContinue }
            else { $env:SSL_CERT_FILE = $previousCA }
        }
    }
}

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
    Start-AgentMenu -AgentHome $agentHome -Binary (Join-Path $PSScriptRoot 'browser-agent.exe')
    exit 0
} catch {
    Write-Host 'Agent tayyorlanmadi. Foydalanuvchi papkasi ruxsatlari va ilova oʻrnatilishini tekshiring.'
    exit 1
} finally {
    Remove-Item Env:BROWSER_AGENT_KEY_PASSPHRASE -ErrorAction SilentlyContinue
}
