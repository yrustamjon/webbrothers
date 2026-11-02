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

Bu faol ishlab chiqilayotgan tizim. Qoʻllanmagan imkoniyatlar soxta natija oʻrniga aniq xato bilan koʻrsatiladi. Login inventari uchun xavfsiz brauzer integratsiyasi hali yoʻq; parollar/vault/cookie oʻqilmaydi. HTTP metamaʼlumotlari va profilga aniq trafik atributsiyasi hali yoʻq; HTTPS trafik ushlanmaydi yoki ochilmaydi. Trafik grafigi hozir qurilma hisoblagichlarini davriy soʻrashga asoslangan.

Hozir router bir API jarayonida ishlaydi. Redis koʻp-worker koordinatsiyasi, MFA, delegatsiyalangan ruxsatlar, OS keychain integratsiyasi, avtomatik imzolangan yangilanishlar va toʻliq platforma oʻrnatish sinovlari alohida ishlar. Windows/macOS binarini kompilyatsiyalash u yerda amaliy tekshiruv oʻtkazilganini anglatmaydi. CI binarlari imzolanmagan sinov artefaktlari; production paketlari deb tarqatmang.

SMTP sozlanmaguncha tasdiqlash va parol tiklash xati yuborilmaydi. Imzolangan agent relizi serverda sozlanmaguncha yuklab olish mavjud emas. Maxfiy qiymatlarni Gitga qoʻshmang.

[Arxitektura](docs/architecture.md), [ishlar rejasi](docs/development-plan.md), [xavfsizlik](docs/security.md) va komponent README fayllarida tafsilotlar bor. Yakuniy tekshirilgan holat `docs/validation.md` da qayd etiladi.
