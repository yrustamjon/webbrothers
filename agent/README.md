# Mahalliy agent

Agent faqat oʻzi ishlayotgan OS foydalanuvchisi ruxsatlariga ega. Uni root yoki boshqa foydalanuvchi nomidan ishga tushirmang. Yashirin yigʻish, shell buyruqlari, cookie va parol oʻqish mavjud emas.

## Yigʻish va tekshirish

Go 1.23+ va CGO uchun mahalliy C kompilyatori (Linux: GCC, macOS: Xcode command line tools, Windows: mos GCC) kerak. `CGO_ENABLED=0` bilan tarix adapteri ishlamaydi; uni funksional reliz deb tarqatmang. Har bir OS binarini oʻsha OS dagi CI orqali yigʻing.

```sh
cd agent
go mod download
go test -race ./...
go build -o browser-agent ./cmd/browser-agent
```

## Ulash

Server ishonchli TLS 1.3 sertifikatiga ega boʻlishi shart. Mahalliy ishlab chiqishda faqat oʻzingiz yaratgan CA sertifikatini `SSL_CERT_FILE` orqali ishoning; TLS tekshiruvi oʻchirilmaydi. Manzil HTTPS boʻlishi kerak.

`BROWSER_AGENT_KEY_PASSPHRASE` kamida 16 belgili mahalliy sir boʻlsin. Uni shell tarixiga yoki repozitoriyga yozmang: xavfsiz OS xizmat muhiti orqali taʼminlang. U AES-256-GCM bilan mahalliy identifikatorni shifrlaydi (PBKDF2-HMAC-SHA256, 600000 iteratsiya). TPM/Keychain integratsiyasi hali mavjud emas; OS ACL va shifrlangan fayl — ochiq belgilangan zaxira usul. Xizmat parolini boshqarish uchun OS maxfiy saqlash vositasidan foydalanish tavsiya etiladi. Parol yoʻqolsa qayta ulash kerak.

```sh
./browser-agent --action pair --server https://monitor.example.uz --scopes browser.discovery,profile.discovery,history.read,traffic.aggregate
./browser-agent --action run --server https://monitor.example.uz
```

Koʻrsatilgan kodni shaxsiy boshqaruv panelida tasdiqlang. `--scopes` aynan mahalliy rozilikni belgilaydi; server qoʻshimcha ruxsat yuborsa ham agent uni avtomatik qabul qilmaydi. `login.inventory` hozir qoʻllab-quvvatlanmaydi. Alohida `--state` bilan identifikator joyini tanlash mumkin; standart joy OS foydalanuvchi konfiguratsiyasi ichida `browser-monitoring/identity.enc`. Mavjud identifikator ustiga yozilmaydi.

## Haqiqiy imkoniyatlar

* Sinovda aniq mahalliy profil ildizi uchun `BROWSER_AGENT_PROFILE_HOME` berilishi mumkin; server uni oʻzgartira olmaydi.
* Chrome, Edge, Brave va Firefox standart foydalanuvchi profil kataloglari aniqlanadi; har bir profil identifikatori katalog xeshidir, serverga lokal yoʻl yuborilmaydi. Safari mavjud katalogi koʻrsatiladi, tarix adapteri hali yoʻq.
* Chromium/Firefox tarixi faqat oʻqish SQLite ulanishida, bitta izchil SELECT orqali olinadi. WAL fayllari joyida qoladi; bazalar koʻchirilmaydi yoki oʻzgartirilmaydi. Qulf/sxema xatosida aniq xato qaytariladi.
* Tarix URL/sarlavha qidiruvi, sana, saralash, sahifalash; maksimal 200 yozuv/sahifa. 4 MiB RAM LRU kesh 15 soniyadan keyin eskiradi. Qattiq diskka tarix keshi yozilmaydi.
* Linux `/proc/net/dev` dan qurilmaning jami bayt hisoblagichlari. Bu brauzer/profil trafik emas. HTTP metamaʼlumotlari va boshqa OS trafik yigʻuvchilari hali yoʻq.
* WSS sertifikat tekshiruvi, qurilmaga bogʻlangan Ed25519 challenge/proof, token autentifikatsiyasi, 1 MiB chegarasi, soʻrov muddati va takrorlanish tekshiruvi, jitter bilan qayta ulanish.

## Xizmat, toʻxtatish va oʻchirish

Quyidagi xizmat buyruqlarini repozitoriy ildizidan bajaring. Linux uchun `installers/linux/browser-monitoring.service` foydalanuvchi systemd namunasi. `ExecStart` serverini haqiqiy manzilga oʻzgartiring, binarni `~/.local/bin/browser-agent` ga joylang. `~/.config/browser-monitoring/service.env` ni 0600 ruxsat bilan OS maxfiy saqlash siyosatingiz orqali yarating (`BROWSER_AGENT_KEY_PASSPHRASE` talab qilinadi). Bu faylni versiya boshqaruviga qoʻshmang. Bir xil foydalanuvchi ostida avval interaktiv ulashni bajaring.

```sh
mkdir -p ~/.config/systemd/user
cp installers/linux/browser-monitoring.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now browser-monitoring
systemctl --user status browser-monitoring
# Toʻxtatish va avtomatik ishga tushishni oʻchirish:
systemctl --user disable --now browser-monitoring
rm ~/.config/systemd/user/browser-monitoring.service
systemctl --user daemon-reload
```

User systemd odatda foydalanuvchi kirganda boshlanadi. Boot paytida login bo‘lmasa ishlash uchun administrator tasdiqlagan linger siyosati kerak; agent buni yashirincha yoqmaydi. systemd yoʻq tizimda yuqoridagi `run` foreground amali ishlaydi. macOS LaunchAgent namunasi mavjud, lekin mahalliy sirni Keychain yordamida yetkazish va haqiqiy OS sinovi hali talab qilinadi. Windows Service integratsiyasi hali bajarilmagan; Windows binari faqat foreground holatda ishlaydi.

Oʻchirishdan avval dashboardda qurilmani bekor qiling. Jarayonni toʻxtatib, binar, shifrlangan identifikator va xizmat muhit faylini mahalliy oʻchiring. RAM keshi jarayon tugashi bilan yoʻqoladi. `--action clear-cache` shu cheklovni tushuntiradi; ishlayotgan boshqa jarayon keshini masofadan oʻzgartirmaydi.

Imzolangan installer, hardware key storage, credential rotation, xizmatlar uchun avtomatik yangilash va toʻliq Windows/macOS sinovlari hali yoʻq. Qurilma egasi yoki OS administratori xizmatni toʻxtatishi mumkin.
