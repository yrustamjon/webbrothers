# Ishlash qoidalari

- Foydalanuvchiga qisqa oʻzbekcha natijalar yozing.
- Tayyor va tekshirilgan oʻzgarishlarni `origin/main` ga push qiling. Force push qilmang.
- Mustaqil vazifalarda haqiqiy parallel agentlardan foydalaning. Ularni alohida worktree/branchlarda ishlating va umumiy protokolni oldindan kelishing.
- Brauzer tarixi, URL, trafik mazmuni, parol yoki cookie markaziy DB/log/Redisga yozilmasin.
- Faqat foydalanuvchi roziligi bilan, joriy OS hisobidagi mahalliy maʼlumotni oʻqing; TLS tekshiruvini oʻchirmang.
- Windows/macOS amaliy testi, imzolangan reliz va ishlamagan funksiyalarni tayyor deb koʻrsatmang.
- `scripts/check.sh` umumiy testlarni bajaradi; `scripts/smoke.py` haqiqiy agent bilan izolyatsiyalangan HTTPS/WSS sinovi uchun.
