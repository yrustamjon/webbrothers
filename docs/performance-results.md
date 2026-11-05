# WebBrothers: amalga oshirish va haqiqiy oʻlchovlar

2026-11-05, macOS Apple M1. Mavjud0.1.8 kodi, installerlar, Safari tarixi, profil/email metadata va TLS/WSS autentifikatsiyasi saqlandi. Uch mustaqil agent alohida worktree/branchlarda query engine, relay va frontend ustida ishladi; asosiy branchga tekshirib birlashtirildi.

## Amalga oshirilgan qismlar

- Device → Browser → Profile → History/Logins/Traffic; bir vaqtda bitta brauzer akkordeoni. Tarix/login/trafik JS modullari lazy yuklanadi.
- Manbada read-only SQL qidiruv/sana/tartib filtrlari, LIMIT+1 va timestamp/rowid keyset cursor. Default50, yangi UI20/50/100; eski `/query` va offset klientlar bilan moslik saqlandi.
- Source/WAL fingerprint,5 daqiqalik HMAC cursor, oʻzgargan/oʻchgan manba uchun bekor qilish. Kesh4MiB/5s, discovery2s, expiry1s; maʼlumot diskka koʻchirilmaydi.
- Auth+CSRF NDJSON relay,64KiB kadr,1MiB sahifa,100yozuv chegarasi, sequence/correlation, bitta ACK krediti,4parallel agent vazifasi. Disconnect/timeout/revoke/pause soʻrovni bekor qiladi; heartbeat alohida davom etadi.
-250ms debounce, AbortController, cursor oldingi/keyingi sahifa, virtual roʻyxat.100k bevosita sintetik qator testida DOM≤10qator.
- Aggregate trafik: upload/download/total, oʻlchangan B/s, agent kuzatgan UTC kun qismi. Tarmoq uzilganda qayta WSS ulanish.
- macOS/Linux joriy OS hisobidagi TCP/UDP socket metadata:4096 yozuv/snapshot,8snapshot/30s, aniq manba maʼlum boʻlgandagina brauzer atributsiyasi. Profil/ulanish bayti va haqiqiy boshlanish vaqti mavjud emas; `observed_at` kuzatish vaqti.
- Ixtiyoriy HTTP kengaytmasi manba paketi, alohida rozilik va loopback ulash kaliti; faqat origin/metod/status/davomiylik.512hodisa/256KiB/60s RAM ring. Haqiqiy brauzer kengaytmasi oʻrnatish/imzolash sinovi bajarilmadi.
- Mac/Windows launcher xatodan keyin menyuga qaytadi, EOF aylanishni toʻxtatadi, server manzilini oʻzgartirish va alohida qoʻshimcha roziliklar bor.

## Native TLS1.3/WSS benchmark

100000 tarix,10000 login metadata,2 sunʼiy Chrome profili. Agent darajasidagi fixture hech qanday shaxsiy profilni ochmaydi. Quyidagi bir yakuniy run natijalari production p95 emas; localhost tezligi internet tezligini kafolatlamaydi.

| Oʻlchov | Natija |
|---|---:|
| Qurilmalar roʻyxati | 4.22ms |
| Brauzer metadata | 5.18ms |
| Profil metadata | 3.99ms |
| Tarix50, toʻliq sahifa | 14.45ms |
| Tarix50, birinchi kadr | 12.13ms |
| Keyingi cursor sahifa | 13.85ms |
| Tarix qidiruvi | 17.04ms |
| Login50 | 7.65ms |
|4parallel sahifa, jami | 22.77ms |
| Agent RSS, soʻrovlardan keyin | 24.47MiB |
| CPU, OS snapshot | 3.1% |

Tarix sahifasi3kadr/11144HTTP body bayt. Trafikning3kadri 18ms, 1033ms, 2053ms da keldi — javob oxirida birga yigʻib yuborilmadi. RSS/CPU snapshot, peak yoki qatʼiy limit daʼvosi emas.64MiB Go soft heap target va GOMAXPROCS2 native SQLite xotirasi/OS CPU kvotasi emas.

Izolyatsiyalangan smoke+benchmarkning WSS application payload hajmi: yuborilgan 13380bayt/59kadr, qabul qilingan 119888bayt/47kadr. Oʻlchov TLS/WebSocket framing overheadini oʻz ichiga olmaydi; toʻliq wire bandwidth deb talqin qilinmaydi.

HTTP birinchi kadrdan keyin yopildi va navbatdagi soʻrov oʻtdi. Agent toʻxtatilib, eski shifrlangan identifikator bilan qayta ishga tushirildi; soʻrov qayta oʻtdi. Soʻng revoke sinovi ham oʻtdi. Bular tarmoq uzilishi simulyatsiyasi; barcha internet nosozliklarini qamramaydi.

Manbadagi alohida Go benchmark:100k tarixda oʻrtadagi cursor50≈0.302ms, legacy OFFSET≈5.263ms. Bu fixture timestamp indeksiga ega; ilova haqiqiy brauzer bazasiga indeks qoʻshmaydi. Indekssiz manba yoki LIKE contains qidiruvi koʻproq qatorni skan qilishi mumkin. [Asl natija](query-benchmark-results.txt).

## Frontend oʻlchovi va muhim chegara

Alohida Chrome156 x64/Rosetta test jarayoni, alohida browserContext, HTTP mock manba100k/10k, production build,3run. DOM readiness MutationObserver bilan renderer ichida oʻlchandi; bu paint va production foydalanuvchi tezligi emas. Ushbu muhitda dashboard median5.19s, tarix birinchi kadr median5.17s, qidiruv median2.77s boʻldi. Chrome CVDisplayLink xatolari ham kuzatildi. Natijalar sekin; ularning faqat Rosetta sababli ekanligi isbotlanmagan. NativeARM/x86 brauzerda haqiqiy render profilini tekshirish hali zarur. Virtualizatsiya maʼlumot hajmini cheklaydi, ammo bu oʻlchov tez UI mezoni bajarilganini tasdiqlamaydi.

Har run50qatorlik sahifada10DOMqator;3parallel soʻrov69–81ms ichida bekor qilindi. [Toʻliq frontend natijalari](frontend-performance-results.json), [native natijalar](performance-results.json).

## Tekshiruv va ochiq cheklovlar

`scripts/check.sh`: API43passed/1skipped(PostgreSQL testi lokal PostgreSQL yoʻqligi sababli), umumiy7, security18, frontend5model+32Vitest, extension1, barcha Go race/vet testlari oʻtdi. Ruff/Prettier/build oʻtdi. Native smoke macOSda TLS1.3, imzoli WSS, Safari sunʼiy tarixi, login metadata, umumiy trafik, HTTP origin-only bridge va markaziy SQLite dumpida kontent yoʻqligini tekshirdi. PowerShell parser va Mac shell-flow sunʼiy agent bilan tekshirildi.

Windows ulanish inventari `unsupported`; Windows aggregate ishlashi saqlandi. Firefox/Safari login inventari qoʻllanmaydi; odatiy qurilma-lokal password manager yoʻriqnomasi koʻrsatiladi. Parol/cookie/token ajratish, decrypt qilish yoki masofaga yuborish yoʻq. Safari HTTP extension paketi yoʻq. HTTP aniq profil yoki transfer hajmini kafolatlamaydi.

macOS ARM sinov DMG yigʻildi. Windows/macOS Intel native CI va haqiqiy GUI oʻrnatish natijalari alohida qayd etilishi kerak; crosscompile native test emas. Developer ID/notarization/Authenticode bajarilmagan. Relay bir API processida ishlaydi; multi-worker routing hali qoʻllanmaydi.

Berilgan ngrok manzilida dastlab ERR_NGROK3200, qayta ulash urinishida ERR_NGROK334(existing endpoint), keyingi tekshiruvda empty reply kuzatildi. Bu tashqi tunnel holati yakuniy yechilgan deb koʻrsatilmaydi. Lokal HTTPS/WSS sinov oʻtdi; TLS verification oʻchirilmagan.

Qayta bajarish:

```bash
PATH="$PWD/.venv/bin:$PATH" bash scripts/check.sh
.venv/bin/python scripts/native-smoke.py --agent agent/bin/browser-agent --port 18445 --performance --performance-output /private/tmp/webbrothers-performance.json
```
