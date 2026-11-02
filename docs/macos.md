# macOS: Docker ishlatmasdan mahalliy ishga tushirish

Bu yoʻl bitta kompyuterda tekshirish uchun. Mahalliy SQLite faqat hisob, qurilma, sessiya va xavfsizlik metamaʼlumotlarini saqlaydi; brauzer tarixi markaziy bazaga yozilmaydi. Hozirgi bitta jarayonli server uchun PostgreSQL va Redis oʻrnatish talab qilinmaydi. Bu ishlab chiqarish muhiti konfiguratsiyasi emas.

## Bir martalik vositalar

Homebrew oʻrnatilgan boʻlishi kerak. Xcode Command Line Tools oʻrnatilmagan boʻlsa quyidagini bajaring va macOS oynasidagi oʻrnatishni tugating:

```sh
xcode-select --install
```

Keyin terminalda:

```sh
brew install python@3.13 node@24 go mkcert
export PATH="$(brew --prefix python@3.13)/libexec/bin:$(brew --prefix node@24)/bin:$PATH"
python3 --version
node --version
go version
```

Python 3.13, Node 24 va Go 1.23 yoki yangiroq versiya (eng soʻnggi barqaror versiya tavsiya etiladi) ishlatilishi kerak. CGO tarix adapteri uchun Xcode C kompilyatori kerak; `CGO_ENABLED=0` bilan tarix adapteri ishlamaydi. `export PATH` yangi terminal ochilganda qayta kerak boʻlishi mumkin.

## Tayyorlash va serverni boshlash

Quyidagi buyruqlarni repozitoriy ildizida bajaring:

```sh
mkcert -install
bash scripts/setup-local.sh
bash scripts/dev-local.sh
```

Keyingi safar Finder orqali `start-local.command` faylini ikki marta bosishingiz yoki terminalda `bash start-local.command` bajarishingiz mumkin. Yetishmayotgan yigʻilgan fayllar boʻlsa launcher avval setupni bajaradi.

`mkcert -install` faqat mahalliy ishlab chiqish uchun oʻzingizning CA sertifikatingizni macOS ishonch omboriga qoʻshadi; tizim tasdiqlash oynasi chiqishi mumkin. Bu vosita HTTPSni ushlab olish uchun ishlatilmaydi, faqat shu mahalliy server sertifikatini beradi. CAning maxfiy kalitini boshqalarga yubormang.

Setup `.venv` ichiga Python API paketlarini oʻrnatadi, frontendni `npm ci` orqali tayyorlab yigʻadi va agentni `agent/bin/browser-agent` ga mahalliy CGO bilan yigʻadi. Dastlabki tayyorlash uchun internet kerak. Launcher `.local/tls/` ichida mahalliy sertifikatlarni tayyorlaydi, `.local/metadata.db` SQLite bazasini yaratadi va API bilan yigʻilgan frontendni **bir xil server jarayonida** boshlaydi.

Brauzerda **https://localhost:8443** ni oching, hisob yarating va kiring. Manzilni `http://` yoki `127.0.0.1`ga almashtirmang: sessiya Secure cookie va aniq origin bilan himoyalangan. Alohida Vite, PostgreSQL, Redis yoki Docker boshlash kerak emas. Sertifikat xatosi boʻlsa tekshiruvni oʻchirmang: `mkcert -install` tugaganini tekshiring va brauzerni qayta oching.

Server terminali ochiq tursin. Boshqa terminalda repozitoriy ildizidan agentni ulang:

```sh
bash scripts/agent-local.sh pair
```

Agent chiqargan qisqa muddatli kodni dashboarddagi **Qurilma ulash** boʻlimida tasdiqlang. Mahalliy ruxsatlar: brauzerlarni aniqlash, profillarni aniqlash va tarixni oʻqish. Dashboardda ham faqat shu ruxsatlarni tanlang; macOSda ishlamaydigan trafik yoki login inventarini tanlamang.

Ulash yakunlangach:

```sh
bash scripts/agent-local.sh run
```

Dashboardda qurilma tarmoqda koʻrinishi kerak. Uni ochib, brauzer va profilni tanlang; tarix faqat shu kompyuterdan soʻraladi. Profil tarixida hech qanday yozuv boʻlmasa boʻsh natija tabiiy holat.

Agent wrapperi mahalliy kuchli sirni `.local/agent-passphrase` faylida `0600` ruxsat bilan tayyorlaydi va identifikatorni `.local/identity.enc` ichida shifrlab saqlaydi. TLS uchun mkcertning `rootCA.pem` sertifikatini `SSL_CERT_FILE` orqali ishlatadi; sertifikat tekshiruvi oʻchirilmaydi. `.local/` va `.venv/` Gitga qoʻshilmaydi. Sir fayli yoʻqolsa agentni qayta ulash talab qilinadi.

## Toʻxtatish va qayta boshlash

Agent va server terminallarida Ctrl+C bosing. Keyingi safar tayyorlashni takrorlamay, alohida terminallarda quyidagilar yetarli:

```sh
bash scripts/dev-local.sh
# Boshqa terminalda:
bash scripts/agent-local.sh run
```

Qurilmani butunlay uzish uchun avval dashboardda ruxsatini bekor qiling, soʻng agent jarayonini toʻxtating. Mahalliy identifikator va sir faylini oʻchirish qayta ulashni talab qiladi; `.local/metadata.db`ni oʻchirish esa mahalliy hisoblar va qurilmalarni ham oʻchiradi. Ushbu fayllarni saqlash yoki oʻchirishni oʻzingiz tanlang.

`mkcert` ishonchini keyinchalik olib tashlamoqchi boʻlsangiz, shu kompyuterdagi boshqa mahalliy loyihalar undan foydalanmasligini tekshirib, `mkcert -uninstall` buyrugʻini bajaring.

## Tekshirish

```sh
PYTHONPATH=apps/api:packages/security .venv/bin/python -m pytest apps/api/tests
npm --prefix apps/web test
npm --prefix apps/web run build
(cd agent && go test ./...)
```

Bu testlar avtomatlashtirilgan kod tekshiruvlari; haqiqiy macOS brauzer profili, mahalliy huquqlar va xizmat ishlashini alohida tekshirish zarur.

`scripts/smoke.py` macOSda ham vaqtinchalik sunʼiy Chrome profili bilan ishlaydi. Trafik yigʻish faqat Linuxda tekshiriladi; macOSda bu funksiya qoʻllanmaydi.

## macOSdagi haqiqiy imkoniyatlar va cheklovlar

- Chrome, Edge, Brave va Firefoxning standart foydalanuvchi profillari va faqat oʻqish tarix adapterlari mavjud. Agent aynan sizning OS foydalanuvchingiz nomidan ishlasin; `sudo` ishlatmang. Mavjud boʻlmagan profil yoki OS ruxsati yoʻqligi xato sifatida koʻrsatiladi.
- Safari katalogi aniqlanishi mumkin, ammo Safari tarix adapteri hali yoʻq. Brauzer versiyasini aniqlash barcha holatda mavjud emas.
- macOS trafik yigʻuvchisi, HTTP metamaʼlumotlari va login inventari hali qoʻllanmaydi. Linuxning qurilma trafik yigʻindisini macOS natijasi sifatida koʻrsatmaymiz.
- Mahalliy identifikator shifrlanadi; Keychain/Secure Enclave bilan avtomatik integratsiya hali mavjud emas. Kuchli mahalliy parol va OS fayl ruxsatlari talab qilinadi.
- `installers/macos/` ichida LaunchAgent namunasi bor, ammo tayyor avtomatik installer yoki tekshirilgan macOS background-service paketi deb hisoblanmaydi. Dastlab foreground rejimida tekshiring; toʻxtatish uchun Ctrl+C yetarli.
- Ushbu koʻrsatmalar Linux CI tekshiruvlaridan alohida: haqiqiy macOS oʻrnatish, OS huquqlari va xizmatning qayta yuklangandan keyingi ishlashi macOSda tekshirilishi kerak.

Pochta tasdiqlash/parol tiklash uchun SMTP sozlamalari talab qilinadi. SMTPsiz oddiy hisob yaratish va kirish ishlatiladi; yuborilmagan xat yuborildi deb koʻrsatilmaydi.
