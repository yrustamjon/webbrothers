# Markaziy API

Python 3.12+ va PostgreSQL kerak. Loyiha ildizida:

```sh
python -m venv /workspace/.venvs/bmp-api
/workspace/.venvs/bmp-api/bin/pip install -r apps/api/requirements.txt
export PYTHONPATH="$PWD/apps/api:$PWD/packages/security"
export DATABASE_URL='postgresql+psycopg://bmp@localhost/bmp'
cd apps/api
/workspace/.venvs/bmp-api/bin/python -m alembic upgrade head
/workspace/.venvs/bmp-api/bin/uvicorn bmp.main:app --host 0.0.0.0 --port 8000
```

`PUBLIC_ORIGIN` aniq HTTPS manba bo‘lsin. Faqat mahalliy ishlab chiqishda `BMP_DEVELOPMENT=1` cookie Secure atributini o‘chiradi. `BMP_AUTO_CREATE=1` faqat vaqtinchalik sinov bazasini yaratish uchun; ishlab chiqarishda Alembic ishlating. Teskari proksi TLS 1.3/WSS bilan sozlanadi. Agent HTTPS/WSS ni talab qiladi.

Pochta uchun `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` sozlanadi. STARTTLS va sertifikat tekshiruvi saqlanadi; sozlanmagan xizmat 503 qaytaradi. Kodlar logga yozilmaydi. Ro‘yxatdan o‘tish avtomatik xat yubormaydi; sessiyadagi `/auth/verification/send` chaqiriladi.

Sinov: loyiha ildizidan `PYTHONPATH=apps/api:packages/security python -m pytest apps/api/tests -q`. Testlar faqat sunʼiy maʼlumot ishlatadi.

Ulash kodi 5 daqiqa amal qiladi; tasdiqlash va credentialni olish bir martalik. Javob yo‘qolsa qayta ulash zarur. Sessiya va qurilma tokenlarining faqat SHA-256 xeshlari bazada saqlanadi. Agent kanaliga token va Ed25519 kalit isboti kerak. Brauzer javoblari faqat chegaralangan, 30 soniyalik xotira so‘rovlarida bo‘ladi.

Cheklovlar: hozir bir API jarayoni; Redis ko‘p-worker marshrutlash hali yo‘q. Token aylantirish, MFA, delegatsiyalangan access-grantlar va agent reliz reyestri keyingi bosqich. Faqat qurilma egasi kirishi mumkin. Endpoint payloadlari va cookie/headerlarni proksi logiga yozmang. API protsessiga ortiqcha trace yoki request-body logging middleware qo‘shmang.

Imzolangan agent yuklash: `AGENT_RELEASE_DIRECTORY` faqat release administrator yozadigan katalogga, `AGENT_RELEASE_PUBLIC_KEY` base64 Ed25519 ochiq kalitga teng bo‘lsin. Fayl nomi `bmp-agent-{linux|darwin|windows}-{amd64|arm64}` (`windows` uchun `.exe`), yonidagi `.manifest.json` fayli aynan `version`, `platform`, `architecture`, `filename`, `sha256` maydonlarini saqlaydi. Imzolash baytlari `json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")`; `.sig` fayli shu kanonik manifestning base64 Ed25519 imzosidir. Platforma, arxitektura, fayl nomi va SHA-256 birga tekshiriladi; qayta nomlangan boshqa platforma artefakti rad etiladi. Release katalogi faqat deployment administrator tomonidan yoziladigan bo‘lsin. API imzoni yuklashdan oldin tekshiradi; imzolanmagan/tahrirlangan artefakt hech qachon berilmaydi. `/api/v1/agent/releases` faqat haqiqiy mavjud imzolangan artefaktlarni ko‘rsatadi. Maxfiy release kalitini serverga joylamang. Bu oddiy binar imzosi; Windows Authenticode/macOS notarization o‘rnini bosmaydi.

Qurilma egasi `POST /devices/{id}/scopes {"scopes": [...]}` orqali faqat dastlab ulashda tasdiqlangan `enrolled_scopes` doirasida ruxsatlarni kamaytirishi yoki tiklashi mumkin. Yangi toifa uchun qayta ulash kerak. `POST /devices/{id}/monitoring {"paused": true}` barcha yangi maʼlumot so‘rovlarini to‘xtatadi. Har ikkisi sessiya+CSRF talab qiladi. Toraytirish/to‘xtatish kutilayotgan javoblarni bekor qilib, kanalni yopadi; tiklash agentning keyingi avtomatik ulanishida ishlaydi. Bu sozlama agentdagi mahalliy ruxsatlarni kengaytirmaydi. Alembic `0002_consent_controls` eski qurilmalardagi joriy ruxsatlarni boshlang‘ich chegara qilib saqlaydi.
