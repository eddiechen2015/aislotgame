# Game Engine Service — Architecture

## Design Principles

1. **One HTTP service, many games** — Single deployment exposes all slot titles via `gameId` routing.
2. **Plugin boundary** — Each game owns math, settlement, and config; the platform owns transport and GMS.
3. **GMS is the operator gate** — GES never talks to operators; all wallet and session authority flows through GMS.
4. **Fail closed** — Unknown `gameId`, invalid session, or wallet failure blocks the spin.
5. **Game isolation** — A bug in one plugin must not corrupt another game's state or math.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         Game Engine Service (GES)                       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Platform Layer (shared)                         │  │
│  │  HTTP router │ game registry │ GMS client │ session cache │ audit  │  │
│  └───────────────────────────────┬────────────────────────────────────┘  │
│                                  │ resolve gameId                       │
│         ┌────────────────────────┼────────────────────────┐              │
│         ▼                        ▼                        ▼              │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐       │
│  │ asian-tour   │        │ dragon-      │        │  future      │       │
│  │ -01 plugin   │        │ fortune-02   │        │  plugins     │       │
│  │              │        │ plugin       │        │              │       │
│  │ engine       │        │ engine       │        │ engine       │       │
│  │ settlement   │        │ settlement   │        │ settlement   │       │
│  │ config       │        │ config       │        │ config       │       │
│  └──────────────┘        └──────────────┘        └──────────────┘       │
└──────────────────────────────────────────────────────────────────────────┘
         ▲                                                          │
         │ launchToken + gameId                                     │
         │                                                          ▼
┌────────────────┐                                    ┌─────────────────────┐
│  Game Clients  │                                    │  GMS (.NET)         │
│  per gameId    │                                    │  players, wallets   │
└────────────────┘                                    └─────────────────────┘
```

## Layer Responsibilities

### Platform Layer

**Owns:**

- Express/Fastify HTTP host and versioning (`/api/v1/...`)
- `gameId` routing and plugin registry
- GMS internal API client (session validate, wallet debit/credit)
- Launch token verification
- Per-session spin locks (keyed by `sessionId`, not global)
- Round ID generation, audit log envelope
- Rate limiting, CORS, static client hosting
- Demo mode (`WalletProvider` in-memory when GMS unavailable)

**Does not own:**

- Reel strips, paytables, cascade logic
- Per-game settlement rules beyond shared money utilities

### Game Plugin Layer

**Owns (per game):**

- Math engine (`playRound`, RNG consumption)
- Settlement (`settleSpinResultDetailed`, market caps if game-specific)
- Public config builder (symbols, bet range, feature flags for UI)
- Bet validation against game config
- Game-specific simulator and RTP workflow (can live in same folder)

**Does not own:**

- HTTP server lifecycle
- Operator sessions or wallets
- Launch URL generation (GMS)

Details: [docs/game-plugin-contract.md](docs/game-plugin-contract.md)

## Request Lifecycle

### Session Init

```text
Client ──► POST /api/v1/games/{gameId}/session/init { launchToken }
              │
              ├─► Registry: resolve plugin for gameId
              ├─► Verify launchToken (JWT from GMS)
              ├─► GMS: validate session still active
              ├─► GMS: getBalance (optional, for HUD)
              └─► Return { gameSessionToken, balance, config summary }
```

### Spin

```text
Client ──► POST /api/v1/games/{gameId}/spin { bet }
              Authorization: Bearer <gameSessionToken>
              │
              ├─► Resolve plugin + decode session (gameId, sessionId, market, playerId)
              ├─► plugin.validateBet(bet)
              ├─► acquireSpinLock(sessionId)
              ├─► GMS wallet/debit(bet, roundId, gameId)
              ├─► plugin.playRound(bet, rng, market)
              ├─► plugin.settle(result, market)
              ├─► GMS wallet/credit(win, roundId, gameId)
              ├─► audit(roundId, gameId, rng trace, settled result)
              └─► Return spin response + balance
```

`gameId` appears in both the URL and the GMS wallet call so GMS can attribute bets/wins per title for reporting.

## Game Registry

At startup the platform loads all registered plugins:

```typescript
// Conceptual — not implemented yet
registerGame(asianTourPlugin);
registerGame(dragonFortunePlugin);

function getGame(gameId: string): GamePlugin {
  const game = registry.get(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  return game;
}
```

Registry also exposes metadata for GMS catalog sync:

```json
{
  "gameId": "asian-tour-01",
  "name": "Asian Tour",
  "version": "0.2.0",
  "minBet": "0.10",
  "maxBet": "100.00",
  "currencies": ["USD", "CNY"],
  "markets": ["MGA", "Curacao", "Brazil", "Sweepstake"],
  "status": "active"
}
```

GMS stores catalog entries; GES is the source of truth for runtime metadata. A sync job or admin API can push registry → GMS.

## Session Model

Two token types:

| Token | Issued by | Used by |
|-------|-----------|---------|
| `sessionId` | GMS | Operator APIs, embedded in launch token |
| `gameSessionToken` | GES | Game client spin/config calls |

```text
GMS sessionId  ──embedded in──►  launchToken  ──exchanged at──►  gameSessionToken
```

`gameSessionToken` is a signed JWT containing: `sessionId`, `gameId`, `playerId`, `operatorId`, `market`, `currency`, `exp`. GES validates it on every spin without calling GMS on each request; optional periodic re-validation for long sessions.

## Multi-Game Isolation Rules

| Resource | Scope |
|----------|-------|
| Spin lock | `sessionId` (one spin at a time per player session) |
| Math runtime profile | Per plugin process memory; no cross-game globals |
| Simulator artifacts | `games/{gameId}/artifacts/` |
| Audit logs | Tagged with `gameId` + `roundId` |
| Client assets | `clients/{gameId}/` served under `/play/{gameId}/` |

## Repository Layout (Target)

```text
game-engine-service/
  platform/
    server/           # HTTP host, routes, middleware
    gms/              # GMS HTTP client
    registry/         # GamePlugin registry
    shared/           # money, markets, audit helpers, spin lock
  games/
    asian-tour-01/
      engine/
      settlement/
      simulator/
      plugin.ts       # implements GamePlugin
      artifacts/
    dragon-fortune-02/
      ...
  clients/
    asian-tour-01/    # game.html, game.js, assets
    dragon-fortune-02/
  package.json
```

Full migration map: [docs/repository-layout.md](docs/repository-layout.md)

## Integration with GMS

```text
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│   Operator   │ ─── Operator API ─►│     GMS      │ ◄── Internal API ──│     GES      │
│              │                    │              │                    │  (all games) │
│              │ ◄── callbacks ─────│              │                    │              │
└──────────────┘                    └──────┬───────┘                    └──────┬───────┘
                                         │ launchUrl                          │
                                         │  ?gameId=asian-tour-01             │
                                         └────────────────────────────────────►│
                                                                                │
                                         Player ──► Client ──► GES /games/{id}/* │
```

GMS launch URL points to the **client host** with `gameId` and `launchToken`:

```text
https://play.vendor.com/play/asian-tour-01?launchToken=<jwt>
```

GES API base (client calls):

```text
https://ges.vendor.com/api/v1/games/asian-tour-01/...
```

Details: [docs/gms-integration.md](docs/gms-integration.md)

## Deployment

| Unit | Description |
|------|-------------|
| **GES** | One container/process; horizontal scale behind load balancer |
| **GMS** | Separate .NET service |
| **Clients** | Static files from GES or CDN; path per `gameId` |
| **Simulators** | CLI per game; run in CI, not in production deploy |

Sticky sessions are **not** required if `gameSessionToken` is stateless JWT. Spin locks use Redis when running multiple GES replicas.

## Demo vs Production Mode

| Mode | Session | Wallet |
|------|---------|--------|
| **Demo** (`GES_MODE=demo`) | Local demo login per game | In-memory `WalletProvider` |
| **Production** | GMS launch token only | GMS internal wallet API |

Demo login endpoint (dev only):

```text
POST /api/v1/games/{gameId}/demo/login
```

## Non-Goals

- Embedding GMS logic inside GES
- Running game math inside GMS
- Per-game separate HTTP ports in production
- Operator-facing APIs (those stay on GMS only)

## Open Decisions

| Topic | Recommendation |
|-------|----------------|
| Monorepo vs split | Keep in this repo under `game-engine-service/` |
| GameId in URL vs header | URL — explicit, cacheable, matches GMS catalog |
| Registry sync to GMS | Push on deploy + manual admin override |
| Shared settlement helpers | Extract `platform/shared/settlement/` only when 2+ games need same cap logic |
