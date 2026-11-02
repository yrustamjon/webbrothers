# Arxitektura va ish rejasi

Markaziy API faqat hisoblar, sessiyalar, qurilmalar, ruxsatlar va audit metamaʼlumotlarini saqlaydi. Brauzer mazmuni faqat autentifikatsiyalangan soʻrov davomida xotirada uzatiladi; log va Redisga yozilmaydi. Agent faqat joriy OS foydalanuvchisi ruxsat bergan profillarni oʻqiydi.

## Bogʻliqlik grafigi
1. Umumiy protokol → backend, frontend va agent parallel.
2. Xavfsizlik kutubxonasi → backend integratsiyasi.
3. Modul testlari → integratsiya → xavfsizlik tekshiruvi.
4. DevOps parallel; yakuniy ishga tushirish modul integratsiyasidan keyin.

## Umumiy HTTP interfeysi
Barcha yoʻllar /api/v1 ostida. POST /auth/register {email,password}; POST /auth/login {email,password}; GET /auth/me; POST /auth/logout. HttpOnly sessiya cookie; GET /auth/csrf → {csrf_token}, mutatsiyalarda X-CSRF-Token. GET /devices → {items: Device[]}; POST /pairing/start agentdan {display_name,operating_system,architecture,public_key} → {pairing_id,code,expires_at,poll_token}; POST /pairing/approve {code,scopes}; POST /pairing/poll {pairing_id,poll_token} → holat va tasdiqlanganda bir martalik device_token, device_id. POST /devices/{id}/revoke. POST /devices/{id}/query {type,params} → agent javobi. Qurilma: id,display_name,operating_system,architecture,status,last_seen_at,scopes.

## WebSocket v1
Agent /api/v1/ws/agent: Authorization: Bearer device_token. JSON: {version:1,request_id:string,device_id:string,type:string,timestamp:ISO8601,expires_at:ISO8601,scope:string,params:object}. Javob shu korrelyatsiya maydonlari bilan {payload:object,error?:{code,message}}. Ruxsat etilgan soʻrovlar: BROWSER_LIST_REQUEST (browser.discovery), PROFILE_LIST_REQUEST (profile.discovery), HISTORY_QUERY (history.read), LOGIN_INVENTORY_QUERY (login.inventory), TRAFFIC_STATS_REQUEST (traffic.aggregate). Javob turlari mos ravishda BROWSER_LIST_RESPONSE, PROFILE_LIST_RESPONSE, HISTORY_RESPONSE, LOGIN_INVENTORY_RESPONSE, TRAFFIC_STATS_RESPONSE. HEARTBEAT va AGENT_HELLO xizmat xabarlari. Max 1 MiB; soʻrov 30 soniya; max 32 kutilayotgan soʻrov/qurilma. Nomaʼlum tur rad etiladi. Shell buyruqlari yoʻq.

Brauzer: {id,name,profiles:[{id,name}]}; tarix: {items:[{url,title,visited_at,domain,visit_count}],total?,page,page_size}; parametrlar browser_id,profile_id,search,page,page_size,start,end,sort. Trafik: {received_bytes,sent_bytes,attribution:"device",collected_at}; profilga notoʻgʻri bogʻlanmaydi. Login inventari qoʻllanmasa aniq unsupported xatosi.

## Parallel sessiyalar
Backend apps/api; frontend apps/web; agent agent va installers; xavfsizlik packages/security; QA infrastructure, tests, scripts, .github. Har biri alohida Git worktree/branch; faqat orkestrator integratsiya qiladi.

## Muhit cheklovi
Linux, Python 3.12, Node 24 va Go mavjud. Tarmoq proksi ulanishi ishlamayapti; tashqi paketlarni yuklash imkoniyati tekshiriladi. Windows/macOS ijrosi bu muhitda tekshirilmaydi.
