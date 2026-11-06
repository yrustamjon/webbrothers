# WEBBROTHERS LOYIHASI

Brauzer maʼlumotlarini talab boʻyicha boshqarish tizimi

LOYIHA HISOBOTI

Mavzu: mahalliy agent va autentifikatsiyalangan relay asosida brauzer profillari, tarix, login metamaʼlumotlari hamda trafik koʻrsatkichlarini boshqarish.

Hujjat tili: oʻzbek tili. Tuzilishi: uchta asosiy reja. Tayyorlangan sana: 2026-yil 6-noyabr.

Ushbu hujjat WebBrothers repozitoriysidagi dasturiy komponentlar va saqlangan sinov natijalari asosida tayyorlandi. Qoʻllanmagan imkoniyatlar bajarilgan ish sifatida koʻrsatilmaydi.

Toshkent — 2026

# REJA VA HUJJAT TARKIBI

Kirish. Loyihaning dolzarbligi, maqsadi, vazifalari va tadqiqot chegaralari.

I REJA. WebBrothers tizimining nazariy asoslari va talablar tahlili. Brauzer profillari tushunchasi, maʼlumot turlari, foydalanuvchi ssenariylari, funksional va sifat talablari.

II REJA. Tizim arxitekturasi va dasturiy amalga oshirilishi. Mahalliy agent, server relay, frontend, xavfsiz transport, sahifalash, keshlash va trafik integratsiyasi.

III REJA. Tizimni sinash, unumdorlikni baholash va rivojlantirish. Sintetik maʼlumotlar, integratsiya sinovlari, haqiqiy oʻlchovlar, nosozliklarni tahlil qilish va ekspluatatsiya.

Xulosa. Amaliy natijalar va keyingi ishlar. Foydalanilgan manbalar.

Oʻqish tartibi: dastlab tizimning vazifasi va maʼlumot chegaralarini tushunish, keyin komponentlar oʻrtasidagi almashinuvni oʻrganish, oxirida sinovlarning amaliy chegaralarini baholash tavsiya etiladi.

| Qism | Boshlanish sahifasi |
|---|---|
| Kirish | 3 |
| I reja | 4 |
| II reja | 8 |
| III reja | 13 |
| Xulosa | 17 |
| Manbalar | 18 |

# KIRISH

Bir foydalanuvchi bir necha kompyuter, brauzer va profil bilan ishlashi mumkin. Ish profili, shaxsiy profil va alohida loyihalar uchun ochilgan profillar oʻrtasida kerakli tarix yoki saqlangan login joyini topish vaqt talab etadi. Oddiy jadvalga barcha maʼlumotni koʻchirib olish esa nusxalar koʻpayishiga va maxfiylik masalalariga olib keladi. WebBrothers ushbu vazifani maʼlumotning asl manbasini saqlagan holda hal qilishga yoʻnaltirilgan.

Loyihaning maqsadi — egasi ruxsat bergan qurilmadagi brauzer maʼlumotlarini yagona veb interfeys orqali talab boʻyicha koʻrsatish. Mahalliy agent kerakli yozuvni oʻqiydi, server esa foydalanuvchi va qurilma oʻrtasida tekshirilgan aloqa oʻrnatadi. Brauzer yozuvlarini markaziy omborga doimiy import qilish ushbu modelga kirmaydi.

Asosiy vazifalar: qurilmani ulash, brauzer va profillarni aniqlash, tarixni qidirish, login inventarini koʻrsatish, trafik hisoblagichlarini kuzatish va katta natijalarni sahifalab uzatish. Tizim foydalanuvchining joriy OS hisobida ishlaydi; yangi maʼlumot toifasi uchun alohida rozilik talab qilinadi.

Hisobot obyekti mavjud WebBrothers kod bazasidir. Predmet esa agent, relay va interfeys oʻrtasidagi xavfsiz hamda tezkor almashinuvdir. Amaliy baholashda sunʼiy brauzer bazalari ishlatilgan. Natijalar barcha qurilmalar va internet sharoitlari uchun kafolat sifatida talqin qilinmaydi.

# I REJA. NAZARIY ASOSLAR VA TALABLAR TAHLILI

## 1.1. Predmet sohasi va brauzer profillari

Brauzer profili bir brauzer ichida mustaqil sozlamalar va maʼlumotlarni ajratib turadigan ish muhitidir. Bitta kompyuterda Chrome, Firefox, Edge, Brave va Safari oʻrnatilgan boʻlishi mumkin. Ularning har birida bir yoki bir nechta profil mavjud. Shu sababli faqat brauzer nomini koʻrsatish yetarli emas: foydalanuvchi tanlangan yozuv qaysi qurilma va profilga tegishli ekanini tushunishi kerak.

WebBrothers navigatsiyasi Qurilma → Brauzer → Profil → Toifa ketma-ketligiga asoslanadi. Qurilma — fizik kompyuterning roʻyxatdan oʻtgan identifikatori; brauzer — maʼlumot adapteri; profil — mahalliy katalog yoki OS ajratgan ish muhiti; toifa — tarix, login inventari yoki trafik koʻrinishi. Bu tuzilma qidiruv va ruxsatlarni aniq kontekstga bogʻlaydi.

Profilning ko‘rinadigan nomi mahalliy metadata ichidan olinadi. Email topilsa, u profilni farqlashga yordam beradi. Email mavjud emasligi akkaunt tizimdan chiqqanini anglatmaydi. Maʼlumot manbasi emailni bermasa, interfeys buni aniq koʻrsatishi, taxminiy akkauntni haqiqiy deb chiqarib bermasligi kerak.

Guest profillar va avtomatik yaratilgan kataloglar ham uchrashi mumkin. Katalog nomi doim foydalanuvchi tanlagan nom bilan bir xil boʻlmaydi. Shuning uchun identifikatsiya va koʻrsatish nomi alohida vazifalardir: ichki identifikator soʻrov uchun ishlatiladi, tushunarli nom esa foydalanuvchiga chiqariladi.

# 1.2. Maʼlumot turlari va ularning chegaralari

Tarix yozuvi odatda URL, sahifa sarlavhasi, domen, tashrif vaqti va tashriflar sonidan iborat. Brauzerlar ushbu maʼlumotni turli jadvallar va vaqt formatlarida saqlaydi. Adapter vazifasi ularni umumiy javob shakliga keltirishdir. Bunda asl bazani oʻzgartirish yoki tarixni serverga ommaviy koʻchirish talab qilinmaydi.

Login inventari haqiqiy parol qiymatini emas, saqlangan login mavjudligi haqidagi ruxsat etilgan metamaʼlumotni anglatadi. Chrome oilasida domen va foydalanuvchi nomi mavjud boʻlishi mumkin. Shifrlangan parol ustuni tanlanmaydi. Saqlangan yozuv borligi uning paroli hali ham toʻgʻri yoki foydalanishga yaroqli ekanini isbotlamaydi.

Trafik uch darajada ajratiladi. Birinchi daraja qurilma boʻyicha jami qabul qilingan va yuborilgan baytlardir. Ikkinchisi tarmoq ulanishlarining IP, port va protokol kabi metamaʼlumotlaridir. Uchinchisi ruxsatli kengaytma orqali olingan HTTP metod, domen, status va davomiylikdir. Har bir darajaning aniqligi hamda ruxsat talabi turlicha.

Parollarni amalda koʻrish uchun foydalanuvchi tanlangan qurilmadagi brauzer yoki OS parol menejeriga murojaat qiladi. Sayt hisobiga qayta kirish OS himoyasini ochish huquqini avtomatik bermaydi. Bu ajratish foydalanuvchiga qaysi operatsiya masofadan bajarilishi va qaysisi qurilmada tasdiqlanishini tushuntiradi.

| Toifa | Koʻrsatiladigan maʼlumot | Asosiy cheklov |
|---|---|---|
| Tarix | URL, sarlavha, vaqt | Talab boʻyicha sahifa |
| Login inventari | Domen va username | Parol qiymati yoʻq |
| Trafik | Hisoblagich va metadata | Profilga aniq atributsiya yoʻq |

# 1.3. Foydalanuvchi ssenariylari va funksional talablar

Birinchi ssenariy — yangi qurilmani ulash. Foydalanuvchi agentni oʻrnatadi, HTTPS server manzilini belgilaydi, maʼlumot toifalariga rozilik beradi va ko‘rsatilgan kodni sayt orqali tasdiqlaydi. Ulanish natijasida qurilmaga tegishli identifikator va ruxsatlar yaratiladi. Kodning bir martalikligi qayta foydalanishni cheklaydi.

Ikkinchi ssenariy — kerakli profil tarixini topish. Foydalanuvchi qurilmani tanlaydi, bitta brauzerni kengaytiradi va profilga oʻtadi. Tarix toifasi ochilgandagina sahifa soʻraladi. Qidiruv matni, boshlanish va tugash sanasi, tartib hamda sahifa hajmi agentga yuboriladi. Natijalar mahalliy manbada filtrlanadi.

Uchinchi ssenariy — login qayerda saqlanganini aniqlash. Login inventari domen va foydalanuvchi nomini koʻrsatadi. Parol kerak boʻlsa, mahalliy parol menejeri manzili yoki OS boʻlimi tushuntiriladi. Qoʻllanmagan brauzer uchun boʻsh yoki soxta maʼlumot bilan muvaffaqiyat tasavvuri hosil qilinmaydi.

Toʻrtinchi ssenariy — ulanish va ruxsatlarni boshqarish. Foydalanuvchi kuzatuvni toʻxtatishi, mavjud ruxsatlarni toraytirishi yoki qurilmani bekor qilishi mumkin. Eski ulanishga yangi toifa avtomatik qoʻshilmaydi. Yangi rozilik va qayta ulash jarayoni kerak boʻladi. Interfeysda yuklanish, uzilish va ruxsat yetishmasligi holatlari bir-biridan farqlanadi.

# 1.4. Sifat talablari va qabul qilish mezonlari

Tezlik talabi barcha yozuvlarni bir vaqtda yuklash bilan oʻlchanmaydi. Dastlab foydalanuvchiga qaror qabul qilish uchun zarur metadata berilishi, keyin tanlangan toifa qisqa sahifalar bilan olinishi kerak. Odatdagi sahifa hajmi 50 yozuv; interfeysda 20, 50 va 100 variantlari mavjud. Bu tarmoq hajmi va oʻqish qulayligi oʻrtasidagi muvozanatdir.

Xotira chegarasi agent hamda interfeysda alohida taʼminlanadi. Agent keshi hajm va vaqt bilan cheklanadi. Jonli hodisalar ring buffer ichida saqlanadi. Interfeys virtual roʻyxat yordamida ekranga yaqin qatorlarni chizadi. Uzoq profil roʻyxati yoki katta tarix sahifani muzlatmasligi kerak.

Xavfsizlik mezonlari server va agentning har ikki tomonida tekshiriladi. Qurilma identifikatori, soʻrov muddati, korrelyatsiya identifikatori va scope mos kelishi zarur. Maʼlumot toifasiga ruxsat yoʻq boʻlsa, soʻrov bajarilmaydi. TLS tekshiruvini oʻchirish ulanish muammosini hal qilish usuli sifatida qoʻllanmaydi.

Qabul mezonlari orasida bekor qilishning ishlashi, uzilishdan keyin tiklanish, markaziy bazada brauzer kontenti yoʻqligi va katta sunʼiy toʻplamdagi sahifalash mavjud. Native kompilyatsiya, avtomatlashtirilgan test, GUI oʻrnatish va imzolangan reliz turli dalillardir. Ulardan biri bajarilgani qolganlari ham bajarilganini anglatmaydi.

# II REJA. ARXITEKTURA VA AMALGA OSHIRISH

## 2.1. Komponentlar va masʼuliyatlar

Tizim uchta asosiy qatlamdan tashkil topadi: React asosidagi veb interfeys, Python API relay va Go mahalliy agent. Veb interfeys tanlov va koʻrsatish uchun javob beradi. API foydalanuvchi sessiyasi, qurilmaga egalik va ruxsatlarni tekshiradi. Agent esa mahalliy manbaga eng yaqin joyda maʼlumotni oʻqiydi.

Markaziy bazada hisoblar, sessiyalar, qurilma identifikatorlari, juftlash va ruxsat metadata si qolishi mumkin. Tarix, login yozuvlari va trafik mazmunini doimiy saqlash ushbu bazaning vazifasi emas. Redis ham brauzer yozuvlari uchun ombor sifatida ishlatilmaydi. Vaqtinchalik javoblar autentifikatsiyalangan soʻrov doirasida relay xotirasidan oʻtadi.

Mahalliy brauzer bazasi asl manba boʻlib qoladi. Agent read-only ulanish ochadi, filtr va sahifa chegarasini qoʻllaydi, natijani umumiy sxemaga keltiradi. Brauzer ishlayotgani sabab manba band yoki OS tomonidan himoyalangan boʻlishi mumkin. Bunday holatda agent aniq xato qaytaradi va himoyani aylanib oʻtishga urinmaydi.

Arxitekturaning afzalligi — maʼlumotning keraksiz nusxalari kamayadi. Biroq qurilma oflayn boʻlsa, yangi brauzer yozuvlarini olish mumkin emas. Bu cheklov dizaynning tabiiy natijasidir. Interfeys foydalanuvchiga oflayn holatni ochiq koʻrsatishi, oldingi javobni yangidek taqdim etmasligi kerak.

| Qatlam | Texnologiya | Vazifa |
|---|---|---|
| Interfeys | React / TypeScript | Tanlov, sahifalash, koʻrsatish |
| API relay | Python / FastAPI | Sessiya, ruxsat, yoʻnaltirish |
| Agent | Go / SQLite adapterlari | Mahalliy oʻqish va filtrlash |

# 2.2. Qurilmani ulash va xavfsiz transport

Agentning ulanishi oddiy bearer token bilan cheklanmaydi. Server har yangi WSS aloqa uchun qisqa muddatli challenge yuboradi. Agent qurilmaning Ed25519 kaliti bilan javobni imzolaydi. Server imzoni, qurilma holatini va challenge muddatini tekshiradi. Shu tekshiruv yakunlanmaguncha qurilma maʼlumot soʻrovlarini bajaradigan onlayn agent sifatida qabul qilinmaydi.

Foydalanuvchi interfeysi HttpOnly sessiya va mutatsiyalar uchun CSRF tokeni bilan ishlaydi. Soʻrov tanlangan qurilma aynan shu foydalanuvchiga tegishli ekanini tekshiradi. Qurilma tomonidan yuborilgan javob ham oldindan ochilgan soʻrovga mos kelishi shart. Nomaʼlum xabar maydonlari va ruxsat etilmagan soʻrov turlari rad etiladi.

Transport TLS 1.3 va WSS asosida qurilgan. Agent server sertifikatini tekshiradi. Lokal sinovda maxsus vaqtinchalik CA ishlatilishi mumkin, ammo bu sertifikat tekshiruvini oʻchirish degani emas. Sertifikat xatosi, DNS xatosi va portga ulanish xatosi foydalanuvchi uchun alohida tushuntirilishi kerak.

Heartbeat kanalning faol ekanini bilishga yordam beradi. Ulanish uzilganda agent ortib boruvchi kutish bilan qayta ulanadi. Qurilmani revoke qilish token va aloqa holatiga taʼsir etadi; ruxsatning torayishi davom etayotgan soʻrovlarni ham toʻxtatadi. Tizimda ixtiyoriy masofaviy shell bajarish interfeysi mavjud emas.

# 2.3. Sahifalash, qidiruv va chegaralangan kesh

Katta SQLite jadvalida uzoq OFFSET soʻrovi oldingi koʻplab qatorlarni oʻtkazib yuborishni talab qilishi mumkin. Yangi query engine keyset usulida keyingi sahifani oldingi sahifaning soʻnggi vaqt va rowid qiymatlaridan davom ettiradi. Tarix uchun vaqt va ichki qator identifikatori tartibni barqarorlashtiradi; login inventarida rowid boʻyicha seek ishlatiladi.

Cursor foydalanuvchi oʻzgartirib yubora olmaydigan autentifikatsiyalangan token hisoblanadi. U profil, soʻrov filtri, sahifa hajmi va manba holatiga bogʻlangan. Bazaning oʻzi yoki WAL fayli oʻzgarsa, avvalgi cursor eskirishi mumkin. Agent bunday holatda birinchi sahifadan qayta boshlashni soʻraydi. Bu turli manba holatlarini bitta sahifalar zanjiriga aralashtirishni kamaytiradi.

Qidiruv va sana filtri imkon qadar SQL ichida bajariladi. Agent butun jadvalni avval RAMga yuklab, keyin filtrlashga tayanmaydi. LIMIT+1 yondashuvi keyingi sahifa mavjudligini aniqlaydi. Alohida umumiy COUNT talab qilinmaganda, interfeys jami yozuvlar soni mavjud emasligini toʻgʻri koʻrsatadi.

Natija keshi 4 MiB va 5 soniyalik TTL bilan cheklangan. Metadata discovery keshi 2 soniyalikdir. Source fingerprint manba oʻzgarishini sezishga yordam beradi. Kesh sessiya yakunida tozalanadi, eskirgan qiymatlar davriy chiqariladi. Bu kesh doimiy saqlash oʻrnini bosmaydi va server DB yoki Redisga koʻchirilmaydi.

# 2.4. Streaming, bekor qilish va frontend jarayoni

Brauzer interfeysi autentifikatsiyalangan stream endpointiga soʻrov yuboradi. Server uni WSS orqali agentga yetkazadi. Agent natijani chegaralangan kadrlarga ajratadi. Har kadrda request_id, sequence va final kabi korrelyatsiya belgilari mavjud. API ularni tekshirib, NDJSON shaklida interfeysga uzatadi.

Backpressure qabul qiluvchi tomonni ortiqcha yuklamaslik uchun zarur. Agent bitta kadr yuborgach ACK kutadi. Server navbatni cheklaydi va oldingi kadrni HTTP oqimiga topshirgach keyingi kadrga ruxsat beradi. Kadr 64 KiB, umumiy sahifa 1 MiB va 100 yozuv bilan chegaralanadi. Agentda bir vaqtda toʻrttagacha soʻrov bajariladi.

Profil yoki toifa almashtirilganda AbortController keraksiz soʻrovni bekor qiladi. Server disconnect yoki timeoutni aniqlab agent vazifasiga cancellation yuboradi. SQL operatsiyalari context bilan bogʻlanganligi sabab bekor qilish faqat interfeysdagi yuklanish belgisini yashirish bilan cheklanmaydi. Xatolar soxta muvaffaqiyat natijasiga almashtirilmaydi.

Frontendda tarix, inventar va trafik modullari lazy yuklanadi. Qidiruvga 250 millisekund debounce qoʻllanadi. Virtual scrolling katta roʻyxatning faqat koʻrinadigan qismini DOMga chiqaradi. Navigatsiyada bitta brauzer kengayadi; ikkinchisini ochish birinchisini yopadi. Shunday qilib vizual tartib va texnik resurs chegaralari bir-birini toʻldiradi.

# 2.5. Trafik va platforma integratsiyasi

Qurilma umumiy trafiki OS hisoblagichlaridan olinadi. Ikki kuzatuv orasidagi bayt farqi vaqtga boʻlinib B/s koʻrsatkichi hisoblanadi. Birinchi kuzatuvda hali oldingi nuqta mavjud boʻlmagani uchun tezlik tayyor deb koʻrsatilmaydi. Counter kamayishi reset holati sifatida ajratiladi. Kunlik qiymat faqat agent kuzatgan UTC kun qismiga tegishli.

Linux va macOS ulanish metadata kollektorlarida joriy OS hisobiga tegishlilik muhim. macOSda lsof chiqishi, Linuxda proc socket jadvallari va jarayon metadata si ishlatiladi. Profilni IP yoki jarayon nomidan ishonchli ajratib boʻlmaydi. Ulanishning bayt hajmi mavjud boʻlmasa null qaytariladi; observed_at haqiqiy bogʻlanish boshlanishi emas, kuzatish vaqtidir.

HTTP metadata ixtiyoriy brauzer kengaytmasi orqali olinadi. Metod, origin, status va davomiylik uzatiladi. URL yoʻli, query va fragment olib tashlanadi. Autentifikatsiya sarlavhalari, cookie, body va tokenlar yigʻilmaydi. Mahalliy loopback ulash kaliti browser credentiali emas, ushbu integratsiyaning ilova kalitidir.

HTTP hodisalar ringi 512 yozuv, 256 KiB va 60 soniyaga cheklangan. Ulanish snapshotlari esa 4096 yozuvdan, sakkiztagacha snapshot va 30 soniyadan oshmaydi. Windows socket inventari hozir qoʻllanmagan holatni aniq qaytaradi; bu Windows umumiy trafik hisoblagichi ham ishlamaydi degani emas. Safari HTTP kengaytmasi alohida paketlash va imzolashni talab qiladi.

# III REJA. SINOV VA UNUMDORLIK TAHLILI

## 3.1. Sinov metodologiyasi

Sinovlar shaxsiy brauzer profilini oʻqimasdan bajarilishi uchun sunʼiy katalog va SQLite bazalari yaratilgan. Katta toʻplamda jami 100 000 tarix yozuvi va 10 000 login metadata yozuvi ikkita profil boʻylab joylashtirilgan. Fixture yaratish vaqti manba query benchmarkining ichiga qoʻshilmagan. Bu qayta bajariladigan oʻlchov olish imkonini beradi.

Modul testlari query engine, cache, protokol va trafik hisoblash mantiqini alohida tekshiradi. Integratsiya sinovi vaqtinchalik CA va markaziy SQLite bilan haqiqiy Go agentni ishga tushiradi. TLS 1.3 tekshiruvi saqlanadi. Pairing, sessiya, WSS imzo, scope tekshiruvi va agent javoblari birgalikda tekshiriladi.

Maxfiylik tekshiruvida sunʼiy domen, username va maxsus sentinel qiymatlar markaziy baza dumpida qidiriladi. Ularning topilmasligi aynan shu sinov yoʻli kontentni bazaga yozmaganiga dalildir. Bu barcha tashqi log tizimlari ham tekshirildi degan umumiy kafolat emas. Proxy access log, buffering va tunnel inspector sozlamalari ham alohida nazorat qilinishi lozim.

Oʻlchovlar bir nechta maʼnoga ega: mahalliy SQL vaqti, HTTPS/WSS toʻliq sahifa vaqti, frontend DOM tayyorligi va jarayon xotira snapshoti. Ularni bitta tezlik raqamiga birlashtirish notoʻgʻri. Har bir natijada muhit, maʼlumot hajmi va oʻlchangan qatlam aniq aytilishi kerak.

# 3.2. Mahalliy query va transport natijalari

Apple M1 arm64 muhitida manba soʻrovining alohida Go benchmarki oʻtkazilgan. 100 ming tarix yozuvida oʻrtadagi 50 yozuvni cursor bilan olish taxminan 0,302 ms, eski OFFSET yoʻli esa 5,263 ms boʻlgan. Bu fixture vaqt indeksiga ega; ilova haqiqiy brauzer bazasiga yangi indeks qoʻshmaydi. LIKE orqali contains qidiruvi koʻproq qatorni koʻrib chiqishi mumkin.

Quyidagi jadval mahalliy HTTPS/WSS benchmarkining saqlangan yakuniy runiga asoslanadi. Bu internet orqali ishlaydigan barcha qurilmalar uchun latency kafolati emas. Sovuq disk, antivirus, OS ruxsati, band SQLite va tarmoq masofasi natijani oʻzgartirishi mumkin.

Tarixning 50 yozuvli sahifasi uchta kadrga boʻlingan. Birinchi kadr toʻliq sahifadan oldin kelishi foydalanuvchiga natijani bosqichma-bosqich koʻrsatish imkonini beradi. Jonli trafikda uchta kadr taxminan 18, 1033 va 2053 millisekundda kuzatilgan. Bu oqim javob oxirigacha bitta katta obyekt sifatida ushlab turilmaganini koʻrsatadi.

Jarayon RSS snapshoti soʻrovlardan keyin taxminan 24,47 MiB, CPU snapshoti 3,1 foiz boʻlgan. Bu peak xotira yoki qatʼiy OS kvotasi emas. Go uchun 64 MiB soft heap target va GOMAXPROCS cheklovi native SQLite ajratmalarini toʻliq chegaralamaydi.

| Oʻlchov | Natija, ms |
|---|---|
| Qurilmalar roʻyxati | 4.22 |
| Brauzer metadata | 5.18 |
| Tarix, birinchi 50 yozuv | 14.45 |
| Keyingi cursor sahifa | 13.85 |
| Tarix qidiruvi | 17.04 |
| Login inventari, 50 yozuv | 7.65 |
| 4 parallel soʻrov, jami | 22.77 |

# 3.3. Frontend va katta roʻyxatlar sinovi

Frontend unumdorligi transport benchmarkidan alohida baholangan. Sunʼiy HTTP server logical 100 ming tarix va 10 ming login yozuvidan talab qilingan sahifani yaratadi. Ishlab chiqarish frontend buildi alohida Chrome kontekstida ochiladi. Haqiqiy foydalanuvchi brauzeri, tarix bazasi va login ombori ishlatilmaydi.

Native ARM Chrome bilan uchta run natijasida boshlangʻich dashboard mediani 47,9 ms, brauzer akkordeoni taxminan 1 ms boʻlgan. Tarixning birinchi qismi median 315,2 ms, login metadata 317,1 ms va qidiruv 397,1 ms chiqdi. Qidiruv qiymati 250 ms debounce vaqtini ham oʻz ichiga oladi. Fixture kadrlar orasiga sunʼiy kutish qoʻyilganini ham hisobga olish zarur.

Virtual roʻyxat sinovida 50 yozuv olinganda DOMda 10 qator saqlangan. Bevosita 100 ming element bilan bajarilgan komponent testi ham chizilgan qatorlar chegaralanganini tekshiradi. DOM elementlari kamayishi barcha sahifa muammolarini oʻzi hal qilmaydi, ammo katta roʻyxatni toʻliq chizish xarajatini keskin cheklaydi.

Oldingi x64 Rosetta muhitida soniyalar bilan oʻlchanadigan sekinlik kuzatilgan. Native ARM takrorlashda bu holat qaytalanmagan. Shuning uchun yakuniy hujjatda faqat eng qulay raqamni tanlab qolish oʻrniga ikki muhitning natijalari saqlangan. Uch run asosidagi p95 production percentile uchun yetarli statistik asos emas; DOM commit va paint ham bir xil koʻrsatkich emas.

# 3.4. Nosozliklar, oʻrnatish va ekspluatatsiya

Windows launcherda rozilikdan keyin, pairing kodi chiqishidan oldin yuz bergan nosozlik mahalliy kalit faylini oʻqish bilan bogʻliq boʻlgan. Set-Content fayl oxiriga yangi qator yozgan, ConvertTo-SecureString esa tozalanmagan blobni qabul qilmagan. Tuzatishda faylni oʻqigach Trim qoʻllanadi; mavjud kalit va identifikator almashtirilmaydi.

Regression tekshiruvi CRLF, LF va yangi qatorsiz qiymatlarni qayta ochishni qamrab oladi. Boʻsh kalit rad etilishi va asl fayl oʻzgarmasligi tekshiriladi. PowerShell parser testi sintaksisni, native Windows testi esa platformadagi haqiqiy DPAPI yoʻlini tekshirishga xizmat qiladi. Kalitni boshqa OS hisobiga koʻchirish avtomatik ruxsat tiklash usuli emas.

Nginx standart xato sahifasi chiqqanda muammo har doim frontend faylidan kelib chiqmaydi. WebBrothers holatida 8000-portdagi API toʻxtagani aniqlangan. Nginx faol boʻlgan, lekin upstream javob bermagan. API tiklangach lokal va tashqi health tekshiruvlari 200 javobini bergan. Faqat bosh sahifani emas, API manzilini ham tekshirish muhim.

Ishga tushirishda hisob bazasi saqlanishi, frontend build mavjudligi va toʻgʻri PUBLIC_ORIGIN sozlanishi kerak. Imzosiz installer OS ogohlantirishi chiqarishi mumkin. Developer ID, notarization, Authenticode va browser-store imzosi alohida tarqatish bosqichlaridir. Native build yoki avtomatik smoke muvaffaqiyati foydalanuvchining kompyuteridagi toʻliq GUI oʻrnatish sinovini almashtirmaydi.

# XULOSA

WebBrothers loyihasida brauzer maʼlumotlarini markaziy bazaga doimiy koʻchirmasdan boshqarish uchun agent–relay–interfeys modeli ishlab chiqilgan. Mahalliy agent manbadan ruxsat berilgan qismini oʻqiydi, relay esa egalik, sessiya, qurilma kaliti va scope tekshiruvlari asosida almashinuvni boshqaradi. Foydalanuvchi uchun asosiy ish oqimi qurilma, brauzer, profil va toifa tanlashdan iborat.

Amaliy natijalar orasida cursor sahifalash, agentdagi qidiruv va filtrlar, qisqa muddatli RAM kesh, ACK asosidagi streaming, cancellation hamda virtual roʻyxat mavjud. Bular katta toʻplamni bitta javobda yuklash ehtiyojini kamaytiradi. 100 ming tarix va 10 ming login metadata bilan oʻtkazilgan testlar shu yondashuvni oʻlchash imkonini berdi.

Xavfsizlik va imkoniyat chegaralari ham loyiha natijasining bir qismidir. Parol inventari bilan haqiqiy parolga kirish ajratilgan. Aniq profil trafik atributsiyasi mavjud emas. Windows socket inventari, Firefox/Safari login inventari va Safari HTTP kengaytmasi qoʻllanmagan holatlar sifatida koʻrsatiladi. Bu cheklovlarni yashirish foydalanuvchi ishonchini pasaytirishi mumkin.

Keyingi ishlar — imzolangan tarqatish, platforma boʻyicha GUI oʻrnatish sinovlari, ishonchli OS API mavjud joylarda yangi adapterlar, uzoq muddatli resurs sinovlari va koʻp API processi uchun relay koordinatsiyasi. Har bir yangi imkoniyat alohida rozilik, cheklangan xotira va qayta bajariladigan test bilan kiritilishi lozim. Hisobotdagi raqamlar mavjud test muhitini tavsiflaydi, umumiy production kafolatini emas.

# FOYDALANILGAN MANBALAR

Ushbu hisobotning asosiy dalillari loyiha repozitoriysidagi kod, protokol hujjati va saqlangan sintetik oʻlchovlardir. Quyidagi manbalar hujjat tayyorlangan paytdagi fayllarni anglatadi; keyingi commitlarda mazmun oʻzgarishi mumkin.

1. README.md — WebBrothers maqsadi, tarkibi va ishga tushirish boʻyicha umumiy qoʻllanma.

2. docs/performance-protocol.md — cursor, streaming, ACK, cancellation va runtime chegaralari.

3. docs/performance-results.json — native HTTPS/WSS katta toʻplam sinovi oʻlchovlari.

4. docs/query-benchmark-results.txt — mahalliy query engine mikrobenchmark natijalari.

5. docs/frontend-performance-results.json va docs/frontend-performance-native-results.json — frontend muhitlari boʻyicha sintetik oʻlchovlar.

6. agent/internal/browser/query_engine.go; agent/internal/cache/cache.go — read-only query va cache implementatsiyasi.

7. agent/cmd/browser-agent/stream.go; apps/api/bmp/main.py — agent vazifalari va relay oqimi.

8. packages/security/bmp_security/protocol.py — ruxsat, korrelyatsiya va javob sxemasi tekshiruvlari.

9. extensions/http-metadata/README.md — ixtiyoriy HTTP metadata integratsiyasi va cheklovlari.

10. scripts/check.sh; scripts/native-smoke.py; scripts/performance.py — qayta bajariladigan test va oʻlchov vositalari.

11. installers/windows/launch.ps1; tests/windows-launcher.ps1 — Windows kalit oʻqish jarayoni va regression testi.

12. apps/web/src/App.tsx; apps/web/src/HistoryView.tsx; apps/web/src/VirtualList.tsx — navigatsiya, tarix va virtual roʻyxat.

Loyiha repozitoriysi: https://github.com/yrustamjon/webbrothers. Muallif yoki taʼlim muassasasi haqida berilmagan shaxsiy maʼlumotlar ushbu hujjatda toʻqib kiritilmadi.
