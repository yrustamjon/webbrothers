# Windows/macOS agent paketlari

Paket agentni yashirin ishga tushirmaydi va avtomatik start qoʻshmaydi. Ilovani ochganda ko‘rinadigan terminalda saytning HTTPS manzilini kiriting, brauzer/profillarni aniqlash va tarixni oʻqishga `ha` bilan rozilik bering, kodni sayt orqali tasdiqlang. Keyingi ochishda shu shifrlangan qurilma identifikatori ishlatiladi. Toʻxtatish: Ctrl+C. Trafik, cookie yoki parol oʻqish ruxsati berilmaydi.

## Oʻrnatish va yangilash

- macOS: tegishli `bmp-agent-darwin-arm64.dmg` (Apple Silicon) yoki `bmp-agent-darwin-amd64.dmg` (Intel) ni ochib, `WebBrothers Agent.app` ni Applicationsga torting. Uni ochish Terminalni boshlaydi; imzolangan/notarizatsiya qilingan reliz hali alohida sozlanishi kerak. Tashkilot Gatekeeper siyosatini oʻchirmang.
- Windows x64: `bmp-agent-windows-amd64-setup.exe` ni ishga tushiring. Administrator talab qilinmaydi; Start menyusidan WebBrothers Agentni oching. ARM64 uchun mahalliy Windows paketi hozir yoʻq.
- Yangilash: avval ishlayotgan agentni Ctrl+C bilan toʻxtating. Ilova menyusidagi `2 — Yangilanishni yuklab olish` mos platformaning GitHub `releases/latest/download/...` manzilini ochadi. Yuklangan ilova/installerni qayta oʻrnating. Bu foydalanuvchi boshlab beradigan yangilash; avtomatik versiya solishtirish yoki jim oʻrnatish mavjud emas.
- Oʻrnatilgan versiya terminalda koʻrsatiladi. Barqaror GitHub reliz yoʻqligida latest havolasi ishlamaydi; reliz chiqarilgan deb hisoblamang.

Holat va mahalliy sirlar ilovadan tashqarida saqlanadi, shuning uchun almashtirish/upgrade ularni saqlaydi:

- macOS: `~/Library/Application Support/WebBrothers Agent/`; katalog 0700, sir 0600. Parol kuchli tasodifiy fayl; Keychain integratsiyasi deb daʼvo qilinmaydi.
- Windows: `%LOCALAPPDATA%\WebBrothers Agent\`; katalog ACL faqat joriy foydalanuvchiga beriladi, sir Windows DPAPI bilan joriy hisobga shifrlanadi.

Mahalliy server uchun CA zarur boʻlsa oʻzingiz ishonadigan **ochiq CA sertifikati**ni shu katalogdagi `ca.pem` ga joylang. TLS 1.3 va sertifikat tekshiruvi saqlanadi; CA maxfiy kalitini bu yerga koʻchirmang. Server manzilini almashtirish eski qurilmani yangi serverga avtomatik ulamaydi; avval eski ruxsatni bekor qilib, identifikatorni alohida saqlang va yangi ulashni bajaring.

Oʻchirishdan avval saytda qurilma ruxsatini bekor qiling va agentni toʻxtating. Windows standart uninstall yoki macOS appni oʻchirish mahalliy sir/identifikatorni ataylab saqlaydi; ularni foydalanuvchi alohida oʻchirishni tanlaydi.

## Yigʻish

Agentni har bir OSning oʻzida CGO bilan yigʻing; SQLite tarix adapteri C kompilyatoriga bogʻliq. macOS uchun Xcode vositalari, Windows uchun Go va mos MinGW/GCC hamda Inno Setup 6 kerak.

```sh
# macOS, agent binari oldindan CGO_ENABLED=1 bilan yigʻilgan boʻlsin:
bash scripts/package-agent-macos.sh 0.1.0 arm64 agent/bin/browser-agent dist
# Intel uchun: amd64 va shu arxitekturadagi binar
```

```powershell
# Windows x64:
powershell -File scripts/package-agent-windows.ps1 -Version 0.1.0 -BinaryPath agent/bin/browser-agent.exe -OutputDirectory dist
```

`BMP_MAC_SIGN_IDENTITY` berilsa macOS app va ichki binar codesign bilan imzolanadi. Developer ID, notarization/stapling, Windows Authenticode sertifikati va amaliy oʻrnatish testlari alohida talab qilinadi. Imzosiz paketlar faqat sinov artefakti; oddiy foydalanuvchi uchun ishonchli production reliz deb tarqatmang. Launcherlar Windows PowerShell 5.1+/Terminal bilan ishlash uchun; tashkilotning bajarish siyosati ishga tushirishni cheklashi mumkin, uni tizim miqyosida oʻzgartirmang.
