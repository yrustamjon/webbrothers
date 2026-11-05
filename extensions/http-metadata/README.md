# Ixtiyoriy HTTP metadata kengaytmasi

Kengaytma Chrome, Edge va Brave uchun Manifest V3 manba paketidir. `chrome://extensions`, `edge://extensions` yoki `brave://extensions` sahifasida developer mode → Load unpacked bilan shu papkani tanlang. Doʻkon imzosi yoki avtomatik oʻrnatish mavjud emas.

1. Agent menyusida **3** orqali `traffic.http` ruxsatiga alohida rozilik bering. Saytda aynan shu ruxsat bilan qayta ulang.
2. Agent menyusida **5** orqali faqat ushbu ilovaga tegishli mahalliy ulash kalitini oling. Uni ommaviy chat/logga qoʻymang.
3. Kengaytma Options sahifasida kalit va brauzerni kiriting; sayt ruxsatini bering. Brauzer sozlamasida host ruxsatlarini zarur saytlargacha toraytirishingiz mumkin.
4. Agentni menyudagi **1** orqali ishlating. Panel Trafik → HTTP boʻlimi soʻrov bilan oxirgi 60 soniyadagi metadata ni oladi.

Faqat metod, origin (`https://example.com`), yakuniy status va davomiylik olinadi. Path/query/fragment agentga yetib kelishidan oldin olib tashlanadi. Headers, bodies, cookies, parollar va brauzer autentifikatsiya tokenlari oʻqilmaydi. Transfer hajmi API kafolatlamagani sababli `null`; profil atributsiyasi mavjud emas. Brauzer belgisi foydalanuvchi tanlovi, OS orqali tekshirilgan profil identifikatori emas.

Agent faqat `127.0.0.1:18444` da, `traffic.http` roziligi bilan ishlayotgan ulanish davomida qabul qiladi. Loopback HTTP tashqi serverga transport emas; tashqi transport TLS 1.3/WSS boʻlib qoladi. Mahalliy ulash kaliti HTTPS sayt credentiali emas. Kalit kengaytmaning mahalliy storage ida turadi; “Toʻxtatish” uni oʻchiradi. Qayta ulash agent identifikatorini yangilab eski kalitni bekor qiladi.

Ring buffer: 512 hodisa / 256 KiB / 60 soniya; sessiya tugaganda tozalanadi. 100 event/soniya qabul chegarasi; kengaytma 4 parallel yuborishdan oshirmaydi, ortiqcha hodisalarni tashlaydi. Toʻliq audit yoki yoʻqotishsiz capture deb hisoblamang.

Firefox uchun `manifest.firefox.json` ni vaqtinchalik nusxada `manifest.json` deb nomlab `about:debugging` → Load Temporary Add-on ishlating. Bu paket Mozilla doʻkonida imzolanmagan; doimiy tarqatish imzolashni talab qiladi. Safari Web Extension uchun alohida Xcode imzosi/paketlash kerak; hozir mavjud emas.

Brauzerning haqiqiy kengaytma oʻrnatish jarayoni va Firefox/Safari native integratsiyasi ushbu relizda sinovdan oʻtgan deb koʻrsatilmaydi.
