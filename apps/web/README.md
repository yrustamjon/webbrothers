# Brauzer nazorati — veb interfeys

Node.js 24 va npm talab qilinadi.

```sh
cd apps/web
npm ci
npm run dev
```

Vite `/api` soʻrovlarini shu kompyuterdagi 8000-port backendga uzatadi. Ishlab chiqarishda `npm run build` hosil qilgan `dist/` katalogini HTTPS server orqali bering; `/api/` backendga proksi qilinishi va boshqa sahifalar `index.html`ga qaytishi kerak. Sessiya cookie uchun ishlab chiqarishda HTTPS majburiy.

```sh
npm test
npm run build
npm audit --omit=dev
```

Interfeys haqiqiy API chaqiruvlaridan foydalanadi: roʻyxatdan oʻtish va kirish, parol tiklash, pochta tasdiqlash, sessiya boshqaruvi, audit, qurilma ulash va bekor qilish, brauzer/profil tanlash, tarix filtrlari va qurilma trafik grafigi. Sana filtrlari UTC kun chegaralarida ishlaydi. Trafik har 5 soniyada olinadi, grafik oxirgi 60 nuqta bilan cheklanadi; bu hisoblagichlar yigʻindisi boʻlib, tezlik emas. Profil atributsiyasi taxmin qilinmaydi.

Brauzer mazmuni localStorage/sessionStorage yoki saqlanuvchi soʻrov keshiga yozilmaydi. Soʻrov xotirasi oxirgi kuzatuvchi ketishi bilan tozalanadi. Chiqish va qurilma bekor qilinishi keshni tozalaydi. Parollar, cookie va tokenlarni koʻrsatish funksiyasi yoʻq. Tarix havolalarida HTTP/HTTPSdan boshqa sxemalar va URL ichidagi login/parol rad etiladi.

Pochta oqimlari ishlashi uchun backendda SMTP sozlanishi kerak. “Agent yuklash” boʻlimi `/agent/releases` endpointidan faqat haqiqiy, server Ed25519 imzosini tekshirgan nashrlarni oladi; OS/arxitektura tanlovi mavjud. Yuklab olingan binar SHA-256 summasi brauzerda qayta tekshiriladi. Paket mavjud boʻlmasa yuklash tugmasi berilmaydi. Qurilma sozlamalarida dastlabki ruxsatlar doirasida faollashtirish/oʻchirish va kuzatuvni pauza/davom ettirish boshqaruvi mavjud; serverga CSRF bilan saqlanadi. Login inventari yoki boshqa agent funksiyasi qoʻllanmasa serverning aniq xatosi koʻrsatiladi. Haqiqiy qurilma bilan yakuniy sinov alohida integratsiyada bajariladi; avtomatik komponent testlari sintetik transport javoblarini ishlatadi.
