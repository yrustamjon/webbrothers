# Tekshirilgan holat — 2026-11-02

Bu hujjat haqiqatan bajarilgan tekshiruvlarni va qolgan ishlarni ajratadi. Ishchi sessiyalar backend, frontend, agent, xavfsizlik va QA/DevOps uchun beshta mustaqil Git worktreeʼda ishladi; orkestrator commitlarni asosiy checkoutda birlashtirdi.

## Natijalar

| Tekshiruv | Natija |
|---|---|
| Backend `pytest apps/api/tests` | PostgreSQL bilan 15/15 oʻtdi |
| Xavfsizlik `unittest` | 17/17 oʻtdi |
| Deployment `unittest` | 4/4 oʻtdi |
| Frontend `npm test` | 5 model + 12 rendered komponent = 17/17 oʻtdi |
| Frontend TypeScript, Prettier va production build | Oʻtdi |
| Frontend production dependency auditi | 0 zaiflik |
| API Ruff lint va format | Oʻtdi |
| Agent `go test -race ./...`, `go vet ./...`, native build | 7 paket oʻtdi; Linux CGO |
| PostgreSQL migratsiyalari | Yangi baza, 0001→0002, downgrade va qayta upgrade oʻtdi |
| API Python 3.13 va frontend Docker image | Ikkalasi qurildi |
| Toʻliq Compose | Migratsiya 0, API/PostgreSQL/Redis sogʻlom; interfeys, login va sessiya tekshirildi |
| Production Nginx | TLS 1.3, HSTS/CSP/nosniff/no-store tekshirildi; TLS 1.2 rad etildi |

Asosiy vositalar: Linux x86_64, Python 3.12.14 (Dockerda 3.13), Node 24, rasmiy SHA256 orqali tekshirilgan Go 1.27.3, CGO/GCC, SQLite drayveri 1.14.52, PostgreSQL 17 va Redis 7. Modullar checksum va TLS tekshiruvi oʻchirilmasdan olindi.

PostgreSQL uchun `TEST_DATABASE_URL` berilmagan oddiy mahalliy `scripts/check.sh` yugurishida shu bitta test aniq `skipped` boʻladi; qolgan 14 backend testi oʻtadi. Yuqoridagi 15/15 natija alohida, haqiqiy PostgreSQL bilan bajarilgan tekshiruvdir. Pytest/httpx/Alembicning tashqi kutubxona deprecation ogohlantirishlari xato deb yashirilmagan.

## Haqiqiy agent bilan integratsiya

```sh
python3 scripts/smoke.py \
  --base-url https://localhost:8443 \
  --ca-file /tmp/bmpqa-tls/ca.pem \
  --agent /workspace/toolchains/browser-agent-current
```

Mahalliy, aniq ishonch berilgan CA va TLS 1.3 orqali, haqiqiy kompilyatsiyalangan Go agenti bilan quyidagilar oʻtdi:

1. Roʻyxatdan oʻtish, login, HttpOnly/Secure sessiya, CSRF nazorati.
2. Bir martalik juftlash kodi; kodni qayta ishlatish rad etilishi.
3. Qurilma Ed25519 kaliti bilan WSS challenge/proof autentifikatsiyasi.
4. Vaqtinchalik sintetik Chrome profili va read-only SQLite tarix soʻrovi.
5. Haqiqiy Linux interfeys bayt hisoblagichlari.
6. Begona hisob va CSRFsiz soʻrovlarning rad etilishi.
7. Agent toʻxtatilganda offline, qayta ishga tushganda onlayn holati.
8. Qurilma bekor qilinishi va eski identifikator bilan qayta ulanishning rad etilishi.
9. PostgreSQL data-only dumpida sintetik tarix URL/sarlavhasi yoʻqligi; mazmun logga chiqarilmadi.

Email tasdiqlash/parol tiklash oqimlari boshqariladigan SMTP transport testi orqali tekshirildi; haqiqiy tashqi xat yetkazilishi tekshirilmagan. Imzoli yuklash sintetik release kaliti va artefakti bilan tekshirildi; haqiqiy OS imzolangan production paket eʼlon qilinmagan.

## Ishga tushirish va qayta tayyorlash

`scripts/setup-cloud.sh` ayni Linux bulut muhiti uchun bogʻliqliklarni qayta tayyorlaydi; Python virtual muhiti `/workspace/.venvs/bmp-api`, Go `/workspace/toolchains/go-current/go`, cacheʼlar `/workspace/toolchains` ichida. `scripts/check.sh` umumiy regressiyalarni bajaradi. Ishga tushirish va oʻchirish [asosiy README](../README.md), [deployment](../infrastructure/deployment/README.md), [API](../apps/api/README.md), [frontend](../apps/web/README.md) va [agent](../agent/README.md) qoʻllanmalarida.

Mahalliy CA ikki kunlik sinov sertifikatidir; yangi sessiya uchun `scripts/local-tls.sh` bilan yangi boʻsh katalogda yarating. Ishlayotgan jarayonlar, konteynerlar va autentifikatsiya boshqa muhitda oʻz-oʻzidan tiklanadi deb hisoblamang. `.env` va maxfiy kalitlar Gitga qoʻshilmaydi.

## Qolgan ishlar

2026-11-02 installer oqimi: latest-release API metadata validatsiyasi va login nazorati bilan API jami 33 test oʻtdi, PostgreSQL testi sozlanmagani uchun 1 tasi oʻtkazilmadi. Frontend 15 Vitest va 5 model testi, format/build hamda Go race/vet oʻtdi. macOS arm64 DMG haqiqiy native `hdiutil` bilan yigʻildi; Windows Inno Setup build va macOS/Windows GUI oʻrnatish hali mahalliy tekshirilmagan. Release workflow uchala native paket tayyor boʻlgach draftni eʼlon qiladi; OS signing/notarization hali sozlanmagan. Sayt oxirgi toʻliq GitHub relizini 60 soniyalik RAM keshi bilan tekshiradi; shaxsiy maʼlumotlar bu oqimga kirmaydi.

2026-11-02 macOS arm64 lokal tekshiruvi: Python 3.13.7, Node 24.3.0, Go 1.25.5. API: 22 test oʻtdi, alohida PostgreSQL testi sozlanmagani uchun 1 tasi oʻtkazilmadi. Umumiy Python/security va frontend testlari, frontend build, Go race testlari va vet oʻtdi. Lokal HTTPS server ishga tushdi; alohida SQLite bazasi va vaqtinchalik sintetik Chrome profili bilan haqiqiy Go agentining HTTPS/WSS ulash, tarix soʻrovi, CSRF, begona hisobdan himoya, offline/qayta ulanish va revoke sinovi oʻtdi. Agent macOSda `SSL_CERT_FILE` orqali mahalliy CAni aniq yuklaydi; TLS tekshiruvi saqlangan. Shaxsiy brauzer profili oʻqilmadi. macOS trafik, Safari, GUI brauzer sinovi, LaunchAgent va imzolangan reliz tekshirilmagan. `mkcert -install` tizim ishonch ombori uchun administrator parolini talab qildi; bu qadam foydalanuvchi terminalida yakunlanishi kerak.

- Windows/macOSda amaliy oʻrnatish, ishlash va oʻchirish testlari; Windows Service integratsiyasi; macOS LaunchAgent namunasi hali amaliy tekshirilmagan.
- TPM/Keychain, signed installer/notarization, avtomatik xavfsiz yangilanish va credential rotation.
- Safari tarixi, qoʻllanadigan browser API asosidagi login inventari, ruxsatli HTTP va connection metamaʼlumotlari.
- Brauzer/profilga ishonchli trafik atributsiyasi; hozir faqat Linux qurilma hisoblagichlari bor.
- Push trafik oqimi, chunk/cancel protokoli, doimiy mahalliy SQLite indeks, resurs benchmarklari.
- Redis orqali koʻp API worker koordinatsiyasi, MFA va delegatsiyalangan ruxsatlar.
- Haqiqiy domen/SMTP/release signing kalitlari bilan production deployment va tashqi audit.

GitHub CI konfiguratsiyasi qoʻshildi; ushbu mahalliy hisobot remote CI joblari oʻtganini tasdiqlamaydi. Windows/macOS native CI matritsasi sozlangan, lekin natijalari bu muhitda olinmagan. Loyiha barcha dastlabki talablar boʻyicha production tayyor deb eʼlon qilinmaydi.
