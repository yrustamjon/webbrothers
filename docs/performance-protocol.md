# On-demand performance protocol

This extends the existing v1 envelope; existing `/query`, pairing and 0.1.8 clients remain supported. Browser records stay at source; no central DB/Redis/content logs. New scopes never extend an existing enrollment automatically.

## Queries and cursor pages

- `HISTORY_QUERY` and `LOGIN_INVENTORY_QUERY`: `browser_id`, `profile_id`, optional `search`, `sort` (`asc`/`desc`), `cursor`, `page_size`; history also `start`/`end`. Default 50; new cursor/stream UI supports 20/50/100. Legacy page/size <=200 remains compatible.
- Go `browser.Query` adds `Cursor string`, `Stream bool`; context APIs `HistoryContext(context.Context, []Browser, Query)` and `InventoryQueryContext(context.Context, []Browser, Query)`. Old `History`/`Inventory` wrappers stay.
- Page payload: `{items, page_size, next_cursor: string|null, has_more: boolean}`; history keeps legacy `page`. Cursors are bounded opaque authenticated agent tokens, bound to browser/profile/filter/source fingerprint. Stale/invalid cursors fail clearly; no offset scan for new cursors. No password, cookie, token or encrypted-password columns selected.
- Browser `capabilities` may add `query.cursor`, `query.streaming` (alongside existing data scopes). Frontend falls back to legacy `/query` for old agents.

## Streaming relay

- Authenticated CSRF-protected `POST /api/v1/devices/{id}/stream`, same Query body as `/query`; server sets `params.stream=true`. Response `application/x-ndjson` records `{request_id, sequence, final, payload?, error?}`.
- Agent WS response keeps existing correlated type/version/device/scope/timestamps, adds **both** `sequence` (0-based consecutive integer) and `final` boolean. Each frame <=64 KiB; cumulative page <=1 MiB, max100 records. Each frame carries a valid page payload (page_size stays requested size, next_cursor/has_more valid on final frame). Agent can split by rows/encoded bytes.
- Agent sends one frame then waits for `STREAM_ACK`: `{version:1,type:'STREAM_ACK',device_id,request_id,sequence}`. Final frame needs no ACK.
- Cancellation: `{version:1,type:'CANCEL_REQUEST',device_id,request_id}`. Controls only affect a live correlated task on that authenticated WS connection. They carry no shell commands.
- Backend queue max2 per request, one unacknowledged frame, max4 concurrent streaming requests/device, 30s envelope deadline. ACK is sent only after HTTP consumer accepts the previous yielded record. Disconnect/timeout/revoke cancels agent task and removes pending buffers. Heartbeats and other requests keep flowing.
- `/query` continues returning `{payload}`/`{error}` and must not receive an unsolicited streaming response.

## Ownership

- Agent query workstream: `agent/internal/browser/**`, `agent/internal/cache/**`, agent query benchmarks only. Root owns Go command/WS loop/protocol.
- Backend workstream: `apps/api/bmp/main.py`, `apps/api/bmp/protocol.py`, `packages/security/**`, API/security tests. Root coordinates contracts.
- Frontend workstream: `apps/web/src/**`, frontend tests (new lazy data-view modules encouraged).
- Root: Go WS streaming/cancel/backpressure, traffic sampling/events, native integration, measurement scripts, installers/docs and release checks.

## Traffic

Aggregate stats preserve required old four fields. Optional derived bandwidth/daily fields must describe only agent-observed intervals, not fabricate full-day history. Connection/HTTP metadata require distinct opt-in scopes (`traffic.connections`, `traffic.http`), bounded RAM rings, sanitized payloads and honest availability/attribution. Never decrypt TLS or collect auth headers/bodies/cookies/tokens.

## Runtime bounds and limitations

The native process uses a 64 MiB **soft Go heap target**, GOMAXPROCS capped at2, four active request workers, five-second SQLite contexts,4 MiB LRU result cache with5s TTL and1s expiry sweep. These are resource controls, not a hard OS CPU/RSS quota: native SQLite and libraries allocate outside the Go heap. Discovery metadata is capped1000 profiles/browser and cached2s. Cache keys hash query/source metadata; source or WAL changes invalidate pages. Cache eviction/shutdown overwrites cached byte buffers; JavaScript/Python/Go temporary objects are subsequently released to their runtimes, not guaranteed physically erased from RAM.

The optional extension is documented in `extensions/http-metadata/README.md`. It observes authorized browser webRequest completion metadata and emits origin-only URLs to a loopback receiver. It neither intercepts TLS nor reads headers/bodies/authentication material. This source extension is not a signed browser-store release. Actual profile identity and reliable transfer size are unavailable; null values and explicit attribution are required.

`traffic.connections` represents sampled socket metadata; `observed_at` is sampling time, not an invented connection-establishment timestamp. Per-connection bytes are null where OS APIs do not expose reliable counts. Windows connection inventory may report unsupported independently of working Windows aggregate counters. No extension or extra traffic scope is enabled by an existing enrollment automatically.
