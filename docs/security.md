# Xavfsizlik chegaralari

## Ishonch modeli

Agent faqat qurilma egasi ochiq tasdiqlagan toifalarni oʻqiydi. Server har soʻrovda sessiyani, qurilma egasini yoki faol boshqaruv ruxsatini hamda scope ni tekshirishi shart. Qurilma tokeni foydalanuvchi sessiyasi oʻrnini bosa olmaydi. Agent mahalliy rozilikni ham mustaqil tekshiradi. Root/administrator oʻz qurilmasidagi dastur ustidan nazoratni saqlaydi.

## Protokol kutubxonasi

`packages/security/bmp_security` protokol tekshiruvi uchun tashqi bogʻliqliksiz Python 3.12 kutubxonasi; qurilma imzosini tekshirish `cryptography` kutubxonasidan foydalanadi. Ishga tushirish: `PYTHONPATH=packages/security python3 -m unittest discover -s packages/security/tests -v`.

`validate_request(raw, authenticated_device_id, granted_scopes)` aniq maydonlarni, tur/scope mosligini, qurilma identifikatorini, 30 soniyadan uzun boʻlmagan amal qilish muddatini, vaqt zonasini, parametrlar roʻyxatini va 1 MiB chegarani tekshiradi. JSON takroriy maydonlari va NaN qiymati rad etiladi. `ReplayGuard.accept` tekshirilgan soʻrov identifikatorini muddati tugaguncha eslab qoladi; joy toʻlsa tirik yozuvlarni oʻchirish oʻrniga yangi soʻrovni rad etadi. Har autentifikatsiyalangan agent sessiyasi uchun alohida guard ishlating.

`validate_response(raw, pending_request)` faqat kutilayotgan soʻrovga mos javobni qabul qiladi; chaqiruvchi pending slotni atomar ravishda bir marta isteʼmol qilishi va natija sxemasini adapterga mos tekshirishi kerak. Javob request_id, device_id, timestamp, expires_at, scope va version maydonlarini asl soʻrovdan oʻzgartirmasdan qaytaradi. Bu yordamchi autentifikatsiya, ruxsat tekshiruvi yoki natija kontentini tozalash oʻrnini bosmaydi.

`redact_url` URL ichidagi foydalanuvchi maʼlumoti, query va fragmentni olib tashlaydi. Yoʻlning oʻzi ham maxfiy boʻlishi mumkin; bu funksiyani qoʻllash URLni server logiga yozishga ruxsat bermaydi.

## Tahdidlar va himoya

- Begona hisob qurilmasiga kirish: har API/WS soʻrovda egalik va scope; javobni faqat asl soʻrov egasiga yetkazish.
- Pairing kodini taxmin qilish: qisqa muddat, bir marta ishlatish, kriptografik tasodif, urinishlarni cheklash. Poll tokeni koddan alohida; tasdiqlash faqat login va CSRF orqali.
- Qayta yuborish: qisqa expiry, request_id, replay guard, javob korrelyatsiyasi; muddati oʻtgan kutishlarni tozalash.
- Agent tokeni oʻgʻirlanishi: diskda shifrlash yoki OS secret storage, bearer tokenlarni log qilmaslik, alohida revoke. Ochiq kalitni saqlashning oʻzi proof-of-possession emas; challenge imzolash ishlatilmasa bunday kafolatni daʼvo qilmang.
- TLS oraliq hujumi: HTTPS/WSS, sertifikat va hostname tekshiruvi, TLS 1.3 reverse proxy. `InsecureSkipVerify`, `verify=False` yoki maxsus MITM CA yoʻq.
- Xotira toʻlishi: 1 MiB xabar, 32 pending/qurilma, 30 soniya timeout, bounded navbat va bekor qilish. Sekin mijozlar uchun cheksiz buffer yoʻq.
- Maxfiy kontent sizishi: tarix/trafik/login payloadlari SQL, Redis, audit, access log, xato trace, analytics yoki backupga yozilmaydi. Reverse proxy sensitive javoblarni cache qilmaydi. Audit faqat hodisa turi, actor/device ID va vaqtni saqlaydi.
- Brauzer huquqlarini chetlab oʻtish: joriy OS foydalanuvchisi, read-only snapshot, parol/cookie/token eksporti yoʻq. Nomaʼlum adapter holati aniq unsupported.

## Ishlab chiqarishga chiqarishdan oldin

Haqiqiy TLS/WSS integratsiyasi, ikki hisob orasida access denial, pairing replay, revoked qurilma qayta ulanishi, maxfiy payloadlarning log/DBga tushmasligi, sessiya tugashi va CSRF sinovlari bajarilishi kerak. Release signing uchun tashkilot kaliti/sertifikati xavfsiz CI secret storage da boʻlishi zarur. Windows/macOS secret storage va installer imzolari oʻsha platformada tekshirilmaguncha qoʻllab-quvvatlangan deb belgilanmaydi. Kalit aylantirish va qurilma proof-of-possession alohida tekshirilishi kerak.

## Qurilma kalitiga egalik isboti

Bearer autentifikatsiyasidan keyin server `DeviceChallenge(device_id)` yaratadi va `message()` natijasini shu socketga yuboradi. Agent `BMP-AGENT-AUTH-V1\n<device_id>\n<nonce>` ASCII baytlarini mahalliy Ed25519 kaliti bilan imzolaydi va AUTH_PROOF xabarini yuboradi. `verify(raw, stored_public_key)` 15 soniyada, faqat bir urinishda, shu nonce/device/key mosligini tekshiradi. Notoʻgʻri urinish ham challenge ni isteʼmol qiladi. Connection manager qurilmani faqat muvaffaqiyatdan keyin online deb roʻyxatdan oʻtkazadi. Nonce disk yoki logda saqlanmaydi. Timestamp javoblari bir xil vaqt nuqtasini saqlashi shart; UTC `Z` va `+00:00` ekvivalent.
