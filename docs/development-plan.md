# Ishlar va qabul mezonlari

## Mustaqil ishlar
| Sessiya | Ajratilgan yoʻllar | Kirish | Natija va qabul mezoni |
|---|---|---|---|
| Orkestrator | docs, packages/protocol, README | Talablar | Protokol, integratsiya, yakuniy tekshiruv |
| Backend | apps/api | HTTP/WSS shartnomasi | Hisob, sessiya, juftlash, ruxsat va router testlari |
| Frontend | apps/web | HTTP shartnomasi | Oʻzbek interfeys, haqiqiy API, komponent test va build |
| Agent | agent, installers | WSS shartnomasi | Mahalliy discovery, ruxsat, cache, trafik, testlar |
| Xavfsizlik | packages/security, docs/security.md | Protokol | Qatʼiy validatsiya, tahdid modeli va testlar |
| QA/DevOps | infrastructure, tests, scripts, .github | Barcha modul interfeyslari | Compose, TLS, CI, smoke test |

Har bir ishchi mustaqil Git worktree va branch ishlatadi. Umumiy fayllarni faqat orkestrator oʻzgartiradi. Modul commitlari tekshirilib asosiy checkoutga qoʻshiladi. Foydalanuvchi koʻrsatmasiga binoan tayyor oʻzgarishlar origin/main ga push qilinadi; force push qoʻllanmaydi.

## Integratsiya tartibi
Xavfsizlik → backend; frontend va agent mustaqil integratsiyalanadi; DevOps soʻng toʻliq smoke tekshiruv. Windows/macOS kodini kompilyatsiyalash shu tizimlarda amaliy ishlash isboti emas. Imzolangan reliz, OS keychain va email yetkazib berish faqat tegishli tashqi xizmatlar va platformalarda tekshiruvdan soʻng tayyor deb belgilanadi.
