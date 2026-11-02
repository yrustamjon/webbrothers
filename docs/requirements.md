# MASTER PROMPT — BROWSER MONITORING PLATFORM

## 0. YOUR ROLE

You are a senior Software Architect, Cybersecurity Engineer, Full-Stack Developer, Systems Programmer, DevOps Engineer, and QA Automation Engineer.

Your task is to design, implement, test, document, and prepare for deployment a production-oriented platform called **Browser Monitoring Platform**.

The system consists of:

1. Central Web Platform.
2. Cross-platform Local Agent.
3. Secure real-time communication.
4. Local data collection and caching.
5. Browser and browser-profile discovery.
6. Browser history explorer.
7. Safe browser credential-management integration.
8. Network traffic monitoring.
9. Device management and administration.
10. Security, audit logging, testing, and deployment.

**All user-facing interfaces, installation instructions, error messages, and documentation must be in Uzbek.** Source code identifiers and technical interfaces may use English.

Do not build a superficial demo, static mockup, or nonfunctional dashboard. Implement actual integrations, backend endpoints, data flows, state management, and tests.

Do not claim functionality works unless it has been implemented and verified.

---

# 1. PROJECT PURPOSE

Develop a secure web platform that allows authenticated users to view permitted browser activity on their own enrolled computers.

Users register on a web platform, download an agent for their operating system, install it, and pair it with their account.

The agent runs as an operating-system background service, maintains an authenticated encrypted connection to the central server, discovers supported browsers, and responds to authorized dashboard requests.

The system must support Windows, macOS, and Linux.

The platform must discover installed browsers and their profiles.

For each supported profile, expose:

- Browser history.
- Saved-login inventory, excluding actual passwords.
- Network traffic statistics.
- Network connection metadata.
- Available HTTP request metadata.
- Real-time monitoring.
- Search and filtering.

**Critical architectural rule:**

The central server MUST NOT persist users' browser history, visited URLs, traffic records, browser credentials, cookies, session tokens, or other sensitive browser content in its database.

The agent retrieves permitted browser data from its own computer and streams the results to the authenticated dashboard only when needed.

The agent is not a remote shell or arbitrary command-execution tool.

---

# 2. HIGH-LEVEL ARCHITECTURE

Implement the following architecture:

```text
                     USER
                       |
                       v
             WEB APPLICATION
                       |
                 HTTPS / WSS
                       |
                       v
               CENTRAL SERVER
                 |         |
                 |         +--- PostgreSQL
                 |              User accounts
                 |              Device identities
                 |              Pairing records
                 |              Access permissions
                 |              Security audit events
                 |
                 +--- Connection Manager
                              |
                       TLS 1.3 / WSS
                              |
                              v
                      LOCAL PC AGENT
                              |
               +--------------+--------------+
               |              |              |
          Browser         Local Cache     Traffic
          Discovery       and Index       Collector
               |              |              |
               +--------------+--------------+
                              |
                       OPERATING SYSTEM
                              |
             Chrome / Firefox / Edge
                 Brave / Safari
```

The server acts as an authenticated message router between the dashboard and enrolled agents.

No sensitive browser records may be stored in a server-side queue, database, persistent cache, or application log.

Transport-level buffers are allowed only for in-flight communication and must have bounded lifetimes.

Avoid caching sensitive response payloads at reverse proxies.

---

# 3. TECHNOLOGY STACK

Use the following initial stack.

## Central backend

- Python 3.13 or a verified compatible version.
- FastAPI.
- PostgreSQL.
- SQLAlchemy.
- Alembic.
- Redis for server-side connection coordination, presence, and non-sensitive transient messaging only.
- WebSocket.
- TLS 1.3.
- Pydantic.
- Structured logging.

## Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- TanStack Query.
- Zustand or equivalent lightweight state management.
- A responsive component system.
- A charting library for traffic analytics.

## Local Agent

Prefer Go for the cross-platform agent, provided its operating-system integrations can be implemented and tested reliably.

Requirements:

- Compiled binaries for Windows, macOS, and Linux.
- Low memory usage.
- Minimal dependencies.
- OS-native background-service integration.
- Secure device identity.
- Browser discovery adapters.
- Local caching.
- Traffic monitoring adapters.
- Persistent authenticated outbound WebSocket connection.

Do not install a full Redis server on every PC unless benchmarks demonstrate a concrete need.

Preferred local architecture:

- SQLite for locally persisted, permitted metadata indexes.
- Bounded in-memory LRU cache.
- Ring buffer for real-time traffic.
- Optional encrypted local journal for permitted historical traffic records.
- A reusable cache interface to permit future Redis or alternative implementations.

The cache must never contain plaintext passwords, authentication cookies, session tokens, or decrypted secrets.

---

# 4. USER REGISTRATION AND AUTHENTICATION

Implement:

- User registration.
- Secure login.
- Email verification.
- Password reset.
- Account settings.
- Device management.
- Active-session management.
- Logout.
- Session revocation.

Security:

- Argon2id password hashing.
- Secure HTTP-only session cookies.
- CSRF protection where applicable.
- Rate limiting.
- Login-attempt protection.
- Mandatory authorization on every device request.
- Optional multi-factor authentication.
- Session expiration.

Users must only access devices that they own or have been explicitly authorized to administer.

No public or unauthenticated device-data endpoint is allowed.

---

# 5. DEVICE ENROLLMENT

After login, the dashboard must have an **Agentlar / Qurilmalar** section.

The page must provide:

- Download agent.
- Select operating system.
- Installation instructions.
- Device pairing.
- Device status.
- Device information.
- Last connected time.
- Disconnect device.
- Revoke device.
- Remove device.

Supported installation targets:

1. Windows.
2. macOS.
3. Linux.

## Pairing flow

1. User logs in to the web platform.
2. User downloads the correct installation package.
3. User installs the agent.
4. The agent creates a device-specific cryptographic identity.
5. The agent displays a pairing code or opens an authenticated pairing flow.
6. User approves enrollment in the dashboard.
7. The agent receives scoped device authorization.
8. A secure outbound connection is established.
9. The dashboard shows the enrolled device as online.

Pairing codes must be short-lived and single-use.

Do not embed permanent user credentials in agent installers.

Each device receives an independent identity so one compromised device can be revoked without affecting other devices.

---

# 6. AGENT INSTALLATION

Installation must be straightforward.

The agent installer should automatically:

- Detect the operating system and architecture.
- Verify installation prerequisites.
- Install the signed agent package.
- Register the OS background service.
- Configure private application directories.
- Generate or register device identity.
- Configure certificate validation.
- Start the service.
- Launch or display the pairing flow.
- Report installation status.

## Windows

Use an appropriate Windows Service implementation.

## macOS

Use launchd with a suitable LaunchDaemon or LaunchAgent design, based on the permissions genuinely required.

## Linux

Use systemd where available.

Provide platform-appropriate alternatives when systemd is unavailable.

## Persistence

The agent should start automatically after the operating system boots, subject to normal OS service controls.

If the Internet connection is lost, it should reconnect with exponential backoff and jitter.

If the PC sleeps, network communication must resume after wake-up.

If the central server restarts, the agent should re-authenticate and restore its connection.

The agent must have a visible, documented uninstall and disable procedure.

The device owner and authorized operating-system administrators must remain capable of stopping or removing it.

---

# 7. AGENT SECURITY

All communication must use HTTPS/WSS with validated TLS certificates.

Prefer TLS 1.3.

Implement:

- Server certificate validation.
- Per-device cryptographic identities.
- Device-bound authentication.
- Short-lived credentials where applicable.
- Credential rotation.
- Device revocation.
- Replay protection.
- Request expiration.
- Request identifiers.
- Strict message schemas.
- Permission checks.
- Secure service configuration.
- Signed update packages.

Use hardware-backed key storage when supported:

- Windows TPM / CNG.
- macOS Keychain / Secure Enclave where appropriate.
- Linux TPM or supported secure secret storage.

Use documented OS fallback mechanisms.

Never store unencrypted private keys in ordinary user-accessible files.

Protect agent executable files and configuration using OS access controls.

Detect unauthorized binary modification using signed releases and integrity verification.

Do not claim that administrator/root users can be prevented absolutely from accessing or modifying software on their own machines.

The agent must not provide:

- Arbitrary shell command execution.
- Unrestricted filesystem browsing.
- Remote credential extraction.
- Remote cookie export.
- Hidden installation.
- Covert surveillance.
- Security-control bypass.

Every data-collection capability must be explicitly disclosed and authorized.

---

# 8. LOCAL AGENT MODULES

Design the agent as modular components.

```text
agent/
  core/
  service/
  identity/
  security/
  transport/
  pairing/
  browser/
    discovery/
    chrome/
    edge/
    brave/
    firefox/
    safari/
  history/
  login_inventory/
  traffic/
  cache/
  permissions/
  monitoring/
  diagnostics/
  updater/
```

Every module must expose clear interfaces.

Avoid tightly coupling the agent to a single browser's database structure.

Each browser adapter should be independently replaceable.

---

# 9. BROWSER DISCOVERY

The agent must discover installed supported browsers.

Initial browser targets:

- Google Chrome.
- Mozilla Firefox.
- Microsoft Edge.
- Brave.
- Safari where supported.

Detect:

- Browser name.
- Browser version, if available.
- Installation status.
- Profile directory.
- Available local profiles.
- Profile display name.
- Browser identifier.
- Profile identifier.

Do not assume every profile has a linked email account.

A browser profile, a synchronized browser account, and a website login are different entities.

Only display an account email when it is available through authorized, supported interfaces.

Do not bypass OS permissions to discover inaccessible profiles.

## Browser accordion UI

On the dashboard, display all detected browsers in a collapsible list.

Example:

```text
PC-01
│
├── Google Chrome                 ▼
│   ├── Personal
│   │   ├── Tarix
│   │   ├── Loginlar
│   │   └── Trafik
│   │
│   ├── Work
│   │   ├── Tarix
│   │   ├── Loginlar
│   │   └── Trafik
│   │
│   └── Profile 3
│
├── Mozilla Firefox              >
├── Microsoft Edge               >
├── Brave                        >
└── Safari                       >
```

Requirements:

- Only one browser accordion may be expanded at a time.
- Clicking another browser closes the previously opened browser.
- Each browser can contain multiple profiles.
- Clicking a profile opens that profile's details.
- Selected browser/profile must remain visually clear.
- Online/offline state must be displayed.
- No full-page reload for ordinary navigation.

If a browser or profile becomes unavailable, show an explicit error or unsupported state.

---

# 10. BROWSER HISTORY MODULE

Each browser profile must have a **Tarix** section.

Supported information:

- Visit URL.
- Page title.
- Visit timestamp.
- Browser identifier.
- Profile identifier.
- Domain.
- Visit count where reliably available.
- Source-specific history identifiers where safe.

Functions:

- Search by URL.
- Search by title.
- Search by domain.
- Filter by date.
- Filter by browser.
- Filter by profile.
- Sort ascending/descending.
- Pagination.
- Incremental updates.
- Manual refresh.
- Show total records when available.
- View full URL.
- Optional export with explicit user authorization.

## History retrieval workflow

```text
Dashboard
   |
   | GET_HISTORY
   v
Central Server
   |
   | Authorized WSS request
   v
Local Agent
   |
   +--- Check permissions
   |
   +--- Check local cache
   |
   +--- Read supported browser data if required
   |
   +--- Normalize and paginate results
   |
   v
Encrypted response stream
   |
   v
Dashboard
```

Do not copy complete browser databases into the central server.

Respect browser database locks and use read-only snapshot mechanisms where supported.

Do not mutate browser history files.

When a browser changes its storage schema, fail gracefully and report the adapter version incompatibility.

History must remain on the source computer unless the user explicitly initiates a permitted export.

The server database must never store this history.

---

# 11. SAVED LOGIN INVENTORY AND PASSWORD SAFETY

Create a **Loginlar / Parollar boshqaruvi** section for each browser profile.

The supported central dashboard feature is a saved-login inventory.

Where authorized browser interfaces allow it, show:

- Website or domain.
- Login username.
- Associated browser.
- Associated profile.
- Whether a saved credential exists.
- Password manager availability.

Do not transmit or centrally display actual saved passwords.

Do not decrypt browser password vaults in the background.

Do not attempt to bypass browser master passwords, OS keychains, secure storage, or hardware-backed protection.

Do not collect:

- Plaintext passwords.
- Session cookies.
- OAuth tokens.
- Refresh tokens.
- Authentication headers.
- Browser secret keys.

If users need to view or modify actual passwords, provide a clearly labeled action that opens the browser's native password manager locally on the device, requiring its normal authentication and user-presence checks.

The dashboard should state when a device-local action is required and should never pretend to reveal a password remotely.

---

# 12. NETWORK TRAFFIC MONITORING

Implement three levels of traffic monitoring.

## Level A: Aggregate traffic

Collect available statistics:

- Download bytes.
- Upload bytes.
- Total traffic.
- Traffic rate.
- Connections count.
- Traffic by browser where attribution is reliable.
- Traffic by domain where attribution is reliable.
- Per-minute traffic.
- Per-hour traffic.
- Daily traffic.
- Real-time traffic charts.

Units:

- B.
- KB.
- MB.
- GB.
- KB/s.
- MB/s.

Clearly distinguish between bytes and bits.

## Level B: Connection metadata

Collect permitted metadata:

- Destination IP.
- Destination port.
- Transport protocol.
- Connection timestamp.
- Connection duration when known.
- Bytes sent.
- Bytes received.
- Process/browser attribution when available.
- Domain attribution when available.

The UI must distinguish exact attribution from inferred attribution.

Do not assume a network connection always belongs to one particular browser profile.

Traffic that cannot be attributed reliably should be labeled:

`Profil aniqlanmadi`

## Level C: HTTP request metadata

Where explicitly authorized and technically supported, collect:

- HTTP method.
- Request URL or safe URL representation.
- Timestamp.
- Response status.
- Request duration.
- Request transfer-size metadata.
- Browser/profile association.

Prefer supported browser-extension APIs or diagnostic interfaces.

Do not decrypt HTTPS through interception or install a custom trusted certificate authority.

Do not log:

- Request bodies.
- Response bodies.
- Authentication headers.
- Cookie headers.
- Authorization tokens.
- Sensitive query parameters.

Redact URL query parameters by default unless explicitly classified as safe.

A network packet observer alone cannot reliably reveal HTTPS HTTP methods, full paths, or response status codes.

Design the UI to show unavailable fields honestly.

---

# 13. REAL-TIME TRAFFIC

Create a real-time traffic view.

Functions:

- Live bandwidth chart.
- Incoming/outgoing statistics.
- Recent connection metadata.
- Recent supported HTTP metadata.
- Pause/resume dashboard display.
- Filter by browser.
- Filter by profile when supported.
- Filter by domain.
- Filter by protocol.
- Search.
- Sort by transfer size.

Use bounded event streams.

Apply backpressure when clients cannot process events quickly enough.

Do not allow unlimited memory growth.

The dashboard must display freshness information such as:

`Oxirgi yangilanish: 14:25:06`

Do not invent historical traffic from before monitoring was enabled.

---

# 14. LOCAL CACHE ARCHITECTURE

The agent must answer requests efficiently.

Use three logical layers.

## Layer 1 — RAM cache

Use for:

- Browser discovery results.
- Profile discovery results.
- Recent safe history query pages.
- Recent connection statistics.
- Short-lived computed metrics.

Implement:

- TTL.
- LRU eviction.
- Memory limits.
- Cache invalidation.
- Metrics.

## Layer 2 — Local SQLite index

Use only for permitted non-secret data.

Examples:

- Browser identity index.
- Profile identity index.
- Optional authorized history metadata index.
- Collector checkpoints.
- Monitoring preferences.

Sensitive local metadata should be encrypted at rest where feasible.

Never store actual decrypted passwords or tokens.

## Layer 3 — Real-time ring buffer

Use a bounded memory buffer for recent traffic events.

Configure:

- Maximum event count.
- Maximum memory.
- Event expiration.
- Drop policy under overload.

If users enable persistent local traffic history, store only permitted metadata locally with clear retention settings and encryption.

## Cache behavior

```text
User request
     |
     v
Permission check
     |
     v
Cache lookup
     |
     +--- Cache hit ---> Response
     |
     +--- Cache miss
               |
               v
        Local data source
               |
               v
          Cache update
               |
               v
            Response
```

Do not cache secret credential values.

---

# 15. WEBSOCKET COMMUNICATION

Implement a persistent authenticated agent-to-server WSS connection.

Agent initiates the outbound connection.

Avoid requiring the user's PC to expose a public inbound port.

## Required capabilities

- Device authentication.
- Heartbeats.
- Presence detection.
- Request correlation.
- Request timeouts.
- Stream cancellation.
- Reconnection.
- Backpressure.
- Payload size limits.
- Chunked responses.
- Rate limiting.
- Authorization checks.
- Error responses.
- Protocol versioning.

Example message types:

```text
AGENT_HELLO
AGENT_STATUS
HEARTBEAT
BROWSER_LIST_REQUEST
BROWSER_LIST_RESPONSE
PROFILE_LIST_REQUEST
PROFILE_LIST_RESPONSE
HISTORY_QUERY
HISTORY_RESPONSE
LOGIN_INVENTORY_QUERY
LOGIN_INVENTORY_RESPONSE
TRAFFIC_STATS_REQUEST
TRAFFIC_STATS_RESPONSE
TRAFFIC_SUBSCRIBE
TRAFFIC_EVENT
TRAFFIC_UNSUBSCRIBE
REQUEST_CANCEL
AGENT_ERROR
```

Each request includes:

- Protocol version.
- Request ID.
- Device ID.
- Request type.
- Timestamp.
- Expiration.
- Permission scope.
- Validated parameters.

Every request must be checked against the authenticated user and device permission records.

Never implement a generic command-execution message type.

---

# 16. CENTRAL SERVER RESPONSIBILITIES

The central server is responsible for:

- User authentication.
- Account authorization.
- Device enrollment.
- Device identification.
- Device pairing.
- Online/offline state.
- WebSocket connections.
- Secure request routing.
- Device revocation.
- Access permissions.
- Security audit logs.
- Rate limiting.
- Secure update metadata.

The central server is NOT responsible for permanently storing:

- Browser history.
- Raw visited URLs.
- Traffic logs.
- Saved passwords.
- Cookies.
- Secret browser contents.

Device-related operational metadata may be stored, but sensitive browser data must not be included in logs, exception traces, Redis messages persisted to disk, or analytics systems.

---

# 17. DATABASE DESIGN

Use PostgreSQL for central application metadata.

Implement migrations for:

```text
users
user_sessions
devices
device_enrollments
device_credentials
device_permissions
device_access_grants
agent_versions
security_audit_events
account_settings
```

## Users

- id
- email
- password_hash
- created_at
- updated_at
- status

## Devices

- id
- owner_id
- display_name
- operating_system
- architecture
- agent_version
- device_public_key
- enrolled_at
- last_seen_at
- status

## Device permissions

- device_id
- authorized_user_id
- permission_scope
- granted_at
- revoked_at

The exact schema may be expanded for production requirements.

Do not create central database tables for raw browser histories, saved passwords, cookies, or network traffic records.

---

# 18. DASHBOARD PAGES

Develop the following pages:

1. Welcome.
2. Registration.
3. Login.
4. Forgot password.
5. Main dashboard.
6. Devices.
7. Add new device.
8. Agent download.
9. Pairing.
10. Device details.
11. Browser explorer.
12. Browser profile details.
13. History.
14. Saved login inventory.
15. Traffic analytics.
16. Live traffic.
17. Device permissions.
18. Account settings.
19. Security settings.
20. Security audit events.

## Main dashboard

Show:

- Total devices.
- Online devices.
- Offline devices.
- Agent versions.
- Device operating systems.
- Last activity timestamps.
- Quick device access.
- Connection warnings.

## Device explorer

Structure:

```text
Device
  |
  +--- Browser
         |
         +--- Profile
                |
                +--- History
                +--- Login inventory
                +--- Traffic
```

Use a responsive layout.

On desktops, prefer a two-panel structure:

- Left: browser/profile navigation.
- Right: selected profile data.

On mobile, use a collapsible navigation drawer.

Do not use placeholder values as real results.

Every status and statistic must be backed by actual data or visibly labeled as a demo.

---

# 19. AGENT STATUS AND RELIABILITY

Supported statuses:

- Online.
- Offline.
- Connecting.
- Reconnecting.
- Pairing required.
- Updating.
- Permission required.
- Error.
- Unsupported browser.

The agent should collect health metrics:

- Agent uptime.
- CPU usage.
- Memory usage.
- Cache size.
- Connection latency.
- Collector status.
- Browser adapter errors.
- Last successful synchronization.

Provide human-readable Uzbek error messages.

Automatic reconnection must not create duplicated sessions.

Multiple agent connections for the same device must have clearly defined conflict handling.

---

# 20. PRIVACY AND CONSENT

A key project requirement is user transparency.

During enrollment, show the exact data categories the agent may collect.

The user must explicitly approve the necessary scopes.

Example scopes:

- Browser discovery.
- Profile discovery.
- Browser history.
- Login inventory.
- Aggregate traffic.
- Connection metadata.
- HTTP request metadata.

Provide controls to:

- Enable/disable each collection category.
- Pause monitoring.
- Resume monitoring.
- Disconnect agent.
- Revoke access.
- Delete local caches.
- Uninstall agent.

No covert collection.

No hidden persistence.

No unauthorized monitoring of other operating-system accounts.

Do not automatically expand existing authorization when new collection features are introduced.

---

# 21. PERFORMANCE REQUIREMENTS

Optimize for:

- Low idle CPU.
- Low idle memory.
- Fast browser discovery.
- Fast history pagination.
- Efficient WebSocket messaging.
- Low network overhead.
- Stable multi-device operation.

Targets for the initial development environment:

- Agent idle CPU target: less than 2% under normal conditions.
- Agent idle RAM target: under 100 MB where practical.
- Typical cached metadata query target: under 200 ms locally.
- Dashboard interaction target: visibly responsive under normal network conditions.

These are engineering targets, not guaranteed results.

Benchmark actual behavior on supported operating systems.

Profile memory, network, database queries, and browser adapters before claiming performance targets are achieved.

---

# 22. ERROR HANDLING

Implement clear handling for:

- Browser not installed.
- Browser profile not found.
- Browser database locked.
- Insufficient operating-system permissions.
- Unsupported browser storage version.
- Invalid device identity.
- Revoked device.
- Expired pairing code.
- TLS validation failure.
- Internet disconnected.
- Server unavailable.
- Cache corruption.
- Traffic collector unavailable.
- Unsupported traffic attribution.
- User authorization denied.

Do not silently fall back to fabricated data.

---

# 23. TESTING REQUIREMENTS

Implement:

## Backend

- Unit tests.
- Integration tests.
- Authentication tests.
- Authorization tests.
- WebSocket tests.
- Database migration tests.
- Rate-limit tests.

## Agent

- Browser discovery tests.
- Profile discovery tests.
- Read-only history adapter tests.
- Local-cache tests.
- Reconnection tests.
- Transport-security tests.
- Permission tests.
- Installation tests.
- Uninstallation tests.

## Frontend

- Component tests.
- Authentication-flow tests.
- Device onboarding tests.
- Accordion behavior tests.
- Browser/profile navigation tests.
- History filter tests.
- Live traffic component tests.
- Error-state tests.

## Security tests

Verify:

- Unauthorized users cannot access another user's device.
- Revoked devices cannot reconnect with old credentials.
- Pairing codes cannot be reused.
- Agent rejects unknown request types.
- Sensitive browser data is absent from server persistence.
- Credentials and tokens do not appear in logs.
- TLS certificate verification cannot be bypassed.
- Invalid payloads cannot trigger arbitrary system operations.

Use synthetic browser fixtures and locally controlled testing environments.

Do not use real users' credentials or private browser data in automated tests.

---

# 24. DEPLOYMENT

Provide development and production deployment configurations.

## Development

- Backend server.
- Frontend server.
- PostgreSQL.
- Redis.
- Local agent development mode.

Docker Compose may be used for the server infrastructure.

## Production

- Nginx or equivalent reverse proxy.
- HTTPS.
- WSS support.
- Secure backend.
- PostgreSQL.
- Redis.
- Database migrations.
- Application monitoring.
- Logging.
- Backup strategy for server metadata.
- Health checks.
- Restart policies.

Agent packages must be generated separately for their supported operating systems.

Provide automated build workflows and signed-release preparation.

---

# 25. DEVELOPMENT PHASES

Implement the system in the following order.

## Phase 1 — Foundation

- Repository structure.
- Development environment.
- Backend skeleton.
- Frontend skeleton.
- PostgreSQL.
- Redis.
- Docker Compose.
- Configuration validation.
- Initial test framework.

## Phase 2 — Authentication

- Registration.
- Login.
- Session management.
- Email verification.
- Security settings.

## Phase 3 — Device enrollment

- Agent identity.
- Pairing codes.
- Pairing approval.
- Device registration.
- Device revocation.

## Phase 4 — Secure communication

- WSS channel.
- TLS.
- Agent authentication.
- Heartbeats.
- Reconnection.
- Request routing.

## Phase 5 — Agent runtime

- Windows service.
- macOS service.
- Linux service.
- Background lifecycle.
- Agent diagnostics.
- Secure installation.
- Uninstallation.

## Phase 6 — Browser discovery

- Browser detection.
- Browser version detection.
- Profile discovery.
- Browser explorer UI.
- Accordion navigation.

## Phase 7 — Browser history

- Read-only history adapters.
- Local history cache.
- Search.
- Pagination.
- Date filtering.
- Dashboard integration.

## Phase 8 — Saved login inventory

- Supported login metadata.
- Profile association.
- Secure native password-manager integration.
- Permission and consent controls.

## Phase 9 — Traffic monitoring

- Aggregate traffic.
- Connection metadata.
- Supported HTTP metadata.
- Real-time streaming.
- Charts.
- Filters.
- Attribution accuracy indicators.

## Phase 10 — Optimization

- Cache improvements.
- Performance benchmarks.
- Backpressure.
- Memory limits.
- Connection scaling.
- Fault tolerance.

## Phase 11 — Security hardening

- Permission audits.
- Threat modeling.
- Key rotation.
- Revocation.
- Signed builds.
- Sensitive data leakage tests.

## Phase 12 — Production readiness

- Cross-platform packaging.
- Installation documentation.
- Integration tests.
- Deployment automation.
- Final technical documentation.

---

# 26. CODE QUALITY

Requirements:

- Modular architecture.
- Clear interfaces.
- Strong typing.
- Explicit error handling.
- No unnecessary dependencies.
- Secure defaults.
- No hard-coded credentials.
- Environment-based configuration.
- Documented database migrations.
- Automated formatting and linting.
- Meaningful automated tests.
- Maintainable source code.

Avoid giant source files.

Avoid duplicate logic.

Use clear abstractions without unnecessary overengineering.

---

# 27. REPOSITORY STRUCTURE

Use a clean monorepo.

Suggested structure:

```text
browser-monitoring/
│
├── apps/
│   ├── web/
│   └── api/
│
├── agent/
│   ├── cmd/
│   ├── internal/
│   ├── adapters/
│   ├── platform/
│   ├── cache/
│   ├── transport/
│   └── tests/
│
├── packages/
│   └── protocol/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
│
├── installers/
│   ├── windows/
│   ├── macos/
│   └── linux/
│
├── tests/
├── docs/
├── scripts/
├── .github/
├── docker-compose.yml
├── README.md
└── .env.example
```

Adjust the structure when genuinely necessary, but preserve clear separation between the web platform, central backend, and local agent.

---

# 28. DEFINITION OF DONE

The project is not considered complete until the following workflow works:

1. A user opens the web platform.
2. The user registers successfully.
3. The user logs into the dashboard.
4. The user downloads a suitable agent.
5. The user installs the agent on a supported PC.
6. The user pairs the agent with their account.
7. The agent establishes an authenticated WSS connection.
8. The dashboard displays the connected device.
9. The agent discovers supported browsers.
10. The dashboard displays the browser list.
11. Clicking a browser expands its profiles.
12. Previously expanded browsers collapse.
13. Selecting a profile displays its available sections.
14. History queries retrieve real permitted local data.
15. Saved-login inventory displays permitted metadata without extracting passwords.
16. Traffic statistics display real collected metadata.
17. Real-time events appear in the dashboard.
18. The central database does not persist browser activity records.
19. Disconnecting the Internet produces a correct offline state.
20. Reconnection restores normal operation.
21. Restarting the PC restarts the authorized agent service.
22. Revoking the device immediately prevents new access.
23. Unauthorized access is blocked.
24. Tests pass on the environments actually available.
25. The documentation explains installation, use, limitations, and removal.

A browser or operating system that cannot support a particular feature must be explicitly marked as unsupported or partially supported.

Never silently fabricate missing functionality.

---

# 29. EXECUTION INSTRUCTIONS FOR THE AI CODING AGENT

You are expected to implement this project, not merely describe it.

Follow these rules:

1. First inspect the existing repository, if any.
2. Identify the available operating system, tools, and permissions.
3. Prepare a detailed implementation plan.
4. Define system boundaries and the communication protocol.
5. Create the initial repository structure.
6. Implement the foundation and work through the development phases.
7. Write tests alongside functionality.
8. Run available tests after each meaningful implementation stage.
9. Fix errors before marking work complete.
10. Keep documentation updated.
11. Never report unimplemented features as complete.
12. Never replace real functionality with static placeholder data.
13. Do not introduce hidden monitoring or credential-extraction features.
14. Preserve all agreed architectural constraints.

Do not stop after creating the architecture document or a visual prototype.

Implement as much functioning, tested software as the available environment permits.

If the environment does not allow testing Windows, macOS, or Linux functionality, clearly distinguish between code that was implemented and functionality actually tested.

At the end, provide an Uzbek report containing:

- Completed modules.
- Actual implemented features.
- Test commands and results.
- Known limitations.
- Unsupported OS/browser combinations.
- Remaining work.
- Installation instructions.
- Development run commands.
- Security considerations.

**Start with the architecture and implementation plan, then proceed directly to actual project development.**

**Primary goal:** A secure, functional, cross-platform browser monitoring system with a persistent local agent, fast local cache, TLS-secured real-time communication, browser/profile navigation, history exploration, safe login inventory, and detailed traffic metadata — without storing sensitive browser activity on the central server.
