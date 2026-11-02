# Ishga tushirish

Talablar: Docker Engine va Compose v2, sertifikat uchun haqiqiy domen, pochta xizmatining SMTP sozlamalari. Bu buyruqlar markaziy serverni ishga tushiradi; agent foydalanuvchining kompyuterida alohida ishlaydi.

## Mahalliy ishlab chiqish

1. `.env.example` nusxasidan `.env` yarating. `POSTGRES_PASSWORD` ga `openssl rand -hex 32` orqali yaratilgan qiymat yozing. Maxfiy faylni Gitga qoʻshmang.
2. `docker compose up --build -d` bajaring. Migratsiya muvaffaqiyatli tugagach API ishga tushadi.
3. Brauzerda `http://localhost:8080` oching. Bu faqat mahalliy ishlab chiqish uchun; oddiy HTTP agentning himoyalangan transporti oʻrnini bosmaydi.
4. `docker compose ps` va `docker compose logs --tail=50 api` bilan holatni tekshiring. HTTP soʻrov/javob tanalarini logga qoʻshmang.
5. `docker compose down` xizmatlarni toʻxtatadi; maʼlumotlar bazasi volume saqlanadi.

Redis yozuvlari diskka saqlanmaydi. Hozirgi API bir jarayonli marshrutizator; Redis mavjudligi koʻp API nusxalarini avtomatik qoʻllab-quvvatlamaydi. Brauzer mazmunini Redisga yubormang.

## Ishlab chiqarish

`.env` ichida `BMP_DEVELOPMENT=0`, `PUBLIC_ORIGIN=https://sizning-domeningiz` va `TLS_DIRECTORY` (faqat ishonchli sertifikat `fullchain.pem`, kalit `privkey.pem`) ni belgilang. SMTP ni sozlang. Domen DNS va sertifikat yangilash tizimi tashqarida boshqariladi.

```
docker compose -f docker-compose.yml -f infrastructure/deployment/production.yml config --quiet
docker compose -f docker-compose.yml -f infrastructure/deployment/production.yml up --build -d
```

TLS 1.3 majburiy, WSS yoqilgan; proxy javobni keshlamaydi va tanalarni diskka buferlamaydi. 8080 porti faqat loopbackda. Agent haqiqiy server sertifikatini tekshirishi kerak. Shaxsiy CA faqat sinovda ishonch doʻkoniga ochiq qoʻshiladi; TLS tekshiruvini oʻchirish taqiqlanadi.

## Boshqariladigan bulutda image qurish

Sessiya proksi CA faylini image ichiga nusxalamang. BuildKit secret orqali birlashtirilgan tizim CA toʻplamini uzating:

```
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f infrastructure/docker/api.Dockerfile -t bmp-api .
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f infrastructure/docker/web.Dockerfile -t bmp-web .
```

Docker proksi sozlamalarini saqlang. Compose build uchun shu secretni qoʻllovchi mahalliy override kerak; uni sessiya yoʻllari bilan repozitoriyga saqlamang.

## Tekshiruv va zaxira

`scripts/check.sh` backend, frontend va Go testlarini bajaradi. `python scripts/smoke.py --base-url https://domen --agent /agent/binar/yoʻli` izolyatsiyalangan sinov hisobini yaratadi; haqiqiy foydalanuvchi brauzer maʼlumotlaridan foydalanmaydi. SMTP tasdiqlash siyosati sinov muhitida alohida sozlanadi.

Faqat PostgreSQL operatsion metamaʼlumotlarini `pg_dump` orqali shifrlangan tashqi saqlashga zaxiralang; tiklashni alohida bazada tekshiring. Redis va agentning lokal brauzer mazmuni markaziy zaxiraga kirmaydi. Sertifikat muddati, DB salomatligi, disk joyi va API mavjudligini kuzating; URL/soʻrov tanalarini monitoringga yozmang.

Image qurilishi va Windows/macOS oʻrnatilishi har bir qoʻllab-quvvatlanadigan platformada alohida tekshirilmaguncha ishlab chiqarishga tayyor deb hisoblanmaydi. CI yaratgan binarlar imzolanmagan sinov natijalaridir; ommaviy tarqatishdan oldin OS imzosi va tekshirilgan release manifest kerak.
