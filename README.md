# Brauzer nazorati platformasi

Oʻzingizga tegishli kompyuterdagi, aniq ruxsat berilgan brauzer maʼlumotlarini HTTPS/WSS orqali koʻrish uchun monorepo. Markaziy server hisoblar, sessiyalar, qurilma identifikatorlari va audit metamaʼlumotlarini saqlaydi; brauzer tarixi va trafik yozuvlarini bazaga yoki Redisga yozmaydi.

## Tarkib

- `apps/api`: FastAPI, SQLAlchemy, PostgreSQL/Alembic, Argon2id sessiyalar, CSRF, bir martalik juftlash, qurilma kaliti isboti, vaqtinchalik soʻrov routeri.
- `apps/web`: oʻzbekcha React/TypeScript interfeys; qurilmalar, brauzer/profil navigatsiyasi, tarix filtrlari, trafik, hisob va xavfsizlik.
- `agent`: faqat mahalliy rozilik bilan ishlaydigan Go agent; profil aniqlash, read-only tarix, chegaralangan RAM kesh va mavjud trafik hisoblagichlari.
- `packages/security`: qatʼiy protokol validatsiyasi, qayta ijrodan himoya, Ed25519 autentifikatsiya.
- `infrastructure`, `scripts`, `.github`: Docker, TLS 1.3 proksi, tekshiruvlar va CI.

## Lokal kompyuterda tez boshlash (macOS)

Docker, PostgreSQL va Redis talab qilinmaydi. Bir martalik vositalar va HTTPS sertifikatini tayyorlash uchun [macOS qoʻllanmasi](docs/macos.md)ga qarang. Keyin:

```sh
bash scripts/setup-local.sh
bash start-local.command
```

Brauzerda **https://localhost:8443** ni oching va hisob yarating. Keyingi safar `start-local.command` faylini ikki marta bosish yoki `bash start-local.command` yetarli. Server terminali ochiq tursin; toʻxtatish uchun Ctrl+C bosing.

Qurilmani ulash uchun boshqa terminalda `bash scripts/agent-local.sh pair` bajaring va kodni dashboardda tasdiqlang. Soʻng `bash scripts/agent-local.sh run` bajaring. Bu buyruqlar brauzer/profilni aniqlash va tarixni oʻqish ruxsatlarini beradi; ularni faqat roziligingiz bilan bajaring. Batafsil ruxsatlar va cheklovlar macOS qoʻllanmasida berilgan.

## Docker bilan boshlash

Docker Engine va Compose v2 kerak. `.env.example` nusxasidan `.env` yarating; `POSTGRES_PASSWORD` uchun `openssl rand -hex 32` orqali yangi qiymat yarating. Keyin:

```sh
docker compose up --build -d
docker compose ps
```

Veb interfeys mahalliy 8080-portda ishlaydi. Agent oddiy HTTPga ulanmaydi: toʻliq agent oqimi uchun ishonchli TLS sertifikatli HTTPS/WSS server talab qilinadi. [Joylashtirish qoʻllanmasi](infrastructure/deployment/README.md) va [API qoʻllanmasi](apps/api/README.md)ni oʻqing.

Frontendni alohida ishlatish:

```sh
cd apps/web
npm ci
npm run dev
```

Vite API soʻrovlarini 8000-portga uzatadi. `PUBLIC_ORIGIN` ni haqiqiy frontend manbasiga tenglang. Faqat mahalliy ishlab chiqishda `BMP_DEVELOPMENT=1`; ishlab chiqarishda HTTPS va Secure cookie majburiy.

## Windows va macOS agent installerlar

Saytdagi **Agent ilovasini oʻrnatish** boʻlimi GitHub Releasesʼdagi oxirgi toʻliq nashrni avtomatik oladi. Windows x86-64 va macOS Intel/Apple Silicon paketlari uchun versiya va yuklash havolasi koʻrsatiladi. Nashr mavjud boʻlmasa, yuklash tayyor deb koʻrsatilmaydi.

`main`ga agent, installer yoki release workflow oʻzgarishi push qilinganda `.github/workflows/agent-release.yml` native testlardan keyin uchala paketni yigʻadi va `agent-v0.1.N` relizini chiqaradi. Barcha fayllar yuklangach reliz eʼlon qilinadi; sayt roʻyxati bir daqiqada yangilanadi. Yangilash — agentni toʻxtatib yangi paketni qayta oʻrnatish; ulanish holati saqlanadi. Bu yashirin avtomatik updater emas. Hozir paketlar OS sertifikati bilan imzolanmagan; [installer qoʻllanmasi](installers/README.md)dagi amaliy sinov va imzolash cheklovlarini oʻqing.

## Sinovlar

Python 3.12+, Node 24, qoʻllab-quvvatlanadigan Go (sinovda 1.27.3) va C kompilyatori kerak. Umumiy sinov bogʻliqliklarini izolyatsiyalangan virtual muhitda oʻrnating:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
(cd apps/web && npm ci)
(cd agent && go mod download)
scripts/check.sh
```

Haqiqiy Go agenti va sintetik brauzer bazasi bilan tekshiruv:

```sh
python3 scripts/smoke.py --base-url https://localhost:8443 --ca-file /tmp/bmpqa-tls/ca.pem --agent /tmp/bmp-agent
```

Bu sinov oʻzining vaqtinchalik profili va hisoblaridan foydalanadi; haqiqiy shaxsiy tarixga tegmaydi. CA va serverni tayyorlash uchun `scripts/local-tls.sh` hamda joylashtirish qoʻllanmasiga qarang. TLS tekshiruvini oʻchirmang.

## Holat va chegaralar

Bu faol ishlab chiqilayotgan tizim. Chrome, Edge va Brave login inventari faqat domen, foydalanuvchi nomi va saqlangan login mavjudligini oladi; parol qiymati/cookie oʻqilmaydi. Firefox/Safari inventari uchun qoʻllanmagan holat aniq koʻrsatiladi. Haqiqiy parolni koʻrish tanlangan qurilmadagi brauzer/OS parol menejerida odatiy avtorizatsiya bilan bajariladi.

Tarix/loginlar talab boʻyicha, odatda50 yozuv bilan olinadi; interfeys20/50/100, autentifikatsiyalangan cursor,250ms qidiruv kechiktirishi, bekor qilish va virtual roʻyxatni qoʻllaydi. Yangi agent WSS orqali ACK bilan chegaralangan qismlarda javob beradi; eski0.1.8 agentlar uchun moslik saqlanadi. Butun tarix ochilishda yuklanmaydi. Qurilma umumiy trafiki jonli stream, kuzatilgan tezlik va UTC kunning agent ishlagan qismi hisobini beradi.

Qoʻshimcha tarmoq ulanishlari va ixtiyoriy HTTP kengaytma metadata si alohida mahalliy va saytdagi rozilikni talab qiladi. Profilga aniq trafik atributsiyasi mavjud emas; qoʻllanmagan OS/API holati yashirilmaydi. HTTPS ochilmaydi. [HTTP kengaytma](extensions/http-metadata/README.md), [protokol va chegaralar](docs/performance-protocol.md), [oʻlchovlar](docs/performance-results.md).

Router hozir bitta API jarayonida ishlaydi. Koʻp-worker relay koordinatsiyasi, MFA, delegatsiyalangan ruxsatlar, OS keychain integratsiyasi, avtomatik imzolangan yangilanishlar va toʻliq platforma oʻrnatish sinovlari alohida ishlar. Kompilyatsiya yoki CI sinovi foydalanuvchi kompyuteridagi amaliy oʻrnatish sinovini almashtirmaydi. Developer ID/notarization va Authenticode hali sozlanmagan; imzosiz paketlar haqida yuklash sahifasida ogohlantirish bor.

SMTP sozlanmaguncha tasdiqlash va parol tiklash xati yuborilmaydi. Maxfiy qiymatlarni Gitga qoʻshmang.

[Arxitektura](docs/architecture.md), [ishlar rejasi](docs/development-plan.md), [xavfsizlik](docs/security.md) va komponent README fayllarida tafsilotlar bor. Tekshirilgan holat [validation](docs/validation.md) va [oʻlchovlar](docs/performance-results.md) da qayd etiladi.
