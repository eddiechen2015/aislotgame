# Game Management Backend — Architecture

## Design Principles

1. **Operator-first API** — All operator interactions go through a single, versioned service-to-service surface.
2. **Wallet model isolation** — Normal and seamless wallet behaviors share player/session logic but diverge at the wallet boundary.
3. **Fail closed** — Invalid sessions, insufficient funds, or failed operator callbacks block play; no silent fallbacks.
4. **Audit everything** — Every transfer, callback, and session mutation is logged for reconciliation.
5. **Engine agnostic** — GMS does not embed game math; it delegates spin execution to the unified Game Engine Service (GES), which hosts multiple game plugins.

## High-Level Topology

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Operator Platform                               │
│  (owns main wallet, player accounts, operator UI)                       │
└───────────────┬─────────────────────────────────────┬─────────────────┘
                │ Service-to-Service API                │ Callback API
                │ (login, transfer, launch, etc.)       │ (seamless debit/credit)
                ▼                                       ▲
┌───────────────────────────────────────────────────────────────────────────┐
│                    Game Management Backend (GMS)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Player Mgmt     │  │ Wallet Mgmt     │  │ Operator API Gateway    │  │
│  │ - registration  │  │ - casino wallet │  │ - auth / rate limit     │  │
│  │ - sessions      │  │ - seamless cb   │  │ - routing / versioning  │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                          │               │
│           └────────────────────┴──────────────────────────┘             │
│                                │                                          │
│                    ┌───────────▼───────────┐                              │
│                    │   Persistence Layer   │                              │
│                    │ PostgreSQL + Redis    │                              │
│                    └───────────┬───────────┘                              │
└────────────────────────────────┼──────────────────────────────────────────┘
                                 │ Internal API (session + wallet context)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Game Engine Service (GES) — single deployment              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │ asian-tour  │  │ dragon-     │  │  future     │  game plugins        │
│  │ -01         │  │ fortune-02  │  │  titles     │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
│  Shared: HTTP API, GMS wallet client, session, audit (by gameId)        │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Game Client (browser / native)                     │
│  Loaded via launch URL; communicates with game engine using session     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

### 1. Player Management

**Owns:** Operator-to-player mapping, session creation, session validation, session expiry.

**Does not own:** Wallet balances, game math, operator main wallet.

Details: [docs/player-management.md](docs/player-management.md)

### 2. Wallet Management

**Owns:** Casino wallet ledger (normal mode), bet debit / win credit orchestration, seamless callback coordination.

**Does not own:** Operator main wallet balances (always authoritative on operator side).

Details: [docs/wallet-management.md](docs/wallet-management.md)

### 3. Operator API (Gateway)

**Owns:** HTTP surface exposed to operators, request authentication, input validation, response shaping, API versioning.

**Delegates to:** Player Management and Wallet Management application services.

Details: [docs/operator-api.md](docs/operator-api.md)

## Request Flow Examples

### Normal Wallet — Player Login and Launch

```text
Operator                    GMS                         Game Engine
   │                         │                              │
   │── POST /players/login ─►│                              │
   │   (operatorPlayerId,    │ create/find player           │
   │    session hints)       │ create session               │
   │◄── sessionId ──────────│                              │
   │                         │                              │
   │── POST /wallet/transfer►│ credit casino wallet         │
   │   (amount)              │                              │
   │◄── new balance ─────────│                              │
   │                         │                              │
   │── POST /games/launch ──►│ validate session             │
   │   (gameId, sessionId)   │ check casino wallet ≥ min    │
   │◄── launchUrl ───────────│ build signed launch URL      │
   │                         │                              │
   │  redirect player ──────────────────────────────────────►│
```

### Seamless Wallet — Spin (Bet Debit)

```text
Game Client        Game Engine              GMS                    Operator
     │                  │                     │                        │
     │── spin request ─►│                     │                        │
     │                  │── debit request ───►│                        │
     │                  │   (session, amount) │── POST /callback/debit►│
     │                  │                     │◄── success / fail ─────│
     │                  │◄── proceed / reject │                        │
     │◄── spin result ──│                     │                        │
```

## Logical Module Structure (Planned)

```text
game-management-backend/
  src/
    Gms.Api/                    # ASP.NET Core host, controllers, middleware
    Gms.Application/            # Use cases: LoginPlayer, TransferFunds, LaunchGame
    Gms.Domain/                 # Entities: Player, Session, CasinoWallet, Operator
    Gms.Infrastructure/         # EF Core, Redis, HTTP clients for operator callbacks
    Gms.Contracts/              # DTOs shared with operators (OpenAPI source)
  tests/
    Gms.UnitTests/
    Gms.IntegrationTests/
```

This layout is a planning artifact only; no code exists yet.

## Data Model (Conceptual)

```text
Operator
  ├── id, name, apiKeyHash, walletType (Normal | Seamless)
  ├── callbackBaseUrl (seamless only)
  └── configured games

Player
  ├── id (GMS internal)
  ├── operatorId + operatorPlayerId (unique composite)
  ├── displayName, currency, locale
  └── createdAt, lastLoginAt

Session
  ├── id (session token)
  ├── playerId, operatorId
  ├── expiresAt, revokedAt
  └── metadata (IP, user agent — optional)

CasinoWallet (normal wallet only)
  ├── playerId
  ├── currency, balance
  └── ledger entries (transfer in, bet, win, transfer out)

WalletTransaction (audit)
  ├── id, playerId, type, amount, balanceAfter
  ├── referenceId (idempotency / round id)
  └── timestamp
```

## Cross-Cutting Concerns

### Authentication (Operator → GMS)

- Each operator receives credentials (API key + secret, or client certificate).
- All operator API requests include authentication headers.
- Requests are scoped to the authenticated operator; operators cannot access other operators' players.

### Authentication (GMS → Operator, Seamless)

- GMS signs callback requests (HMAC or mutual TLS).
- Operator verifies signature before debiting/crediting main wallet.
- Callback payloads include idempotency keys to prevent double charges.

### Session Security

- Session IDs are opaque, high-entropy tokens.
- Sessions are bound to operator + player + optional game context.
- Expired or revoked sessions are rejected on validation and launch.

### Idempotency

- Money transfer and seamless callback endpoints accept an `Idempotency-Key` header.
- Duplicate requests with the same key return the original result without side effects.

### Multi-Tenancy

- Every entity is scoped by `operatorId`.
- Database queries always filter by operator context from the authenticated request.

## Integration with Game Engine Service (GES)

GMS integrates with **one** Game Engine Service that hosts all slot titles. Games are selected by `gameId` in the launch URL and GES API paths.

GMS provides game launch URLs that embed or reference:

- `gameId` (routes to the correct plugin in GES)
- Launch token (signed JWT with session, player, market, wallet type)
- Operator branding / locale parameters

Example launch URL:

```text
https://play.vendor.com/play/asian-tour-01?launchToken=<jwt>
```

GES calls back into GMS (not the operator directly) for:

- Session validation at `session/init`
- Bet debit / win credit per spin (includes `gameId` for reporting)

Full GES design: [../game-engine-service/README.md](../game-engine-service/README.md)

## Non-Goals (Current Phase)

- Operator admin UI
- Player-facing registration (players always come from operators)
- Game math / RTP tuning (handled by separate engine services)
- Payment processing / fiat on-ramp

## Open Design Decisions

| Topic | Options | Notes |
|-------|---------|-------|
| Session token format | Opaque DB token vs signed JWT | JWT reduces DB lookups; opaque allows instant revocation |
| Launch URL signing | HMAC query params vs short-lived JWT | Prevents URL tampering |
| Casino wallet currency | Single per player vs multi | Start with single currency per player |
| Transfer out API | Include in v1 or defer | Operators may want to pull unused casino balance back |

These will be resolved before implementation begins.
