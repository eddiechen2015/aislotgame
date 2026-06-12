# GMS ↔ Game Engine Service Integration

How the Game Management Backend (GMS) integrates with the unified **Game Engine Service (GES)** that hosts multiple slot games.

> **GES documentation:** [../../game-engine-service/README.md](../../game-engine-service/README.md)

## Architecture Shift

| Before (initial design) | Now (target) |
|-------------------------|--------------|
| One deployable service per game | **One GES** hosts all games |
| GMS routes to different service URLs | GMS routes by `gameId` in launch URL |
| Duplicated HTTP/GMS client per game | Shared platform layer in GES |

```text
Operator ──► GMS (.NET) ──► Game Engine Service (TS)
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              asian-tour-01  dragon-fortune-02  ...
              (plugin)       (plugin)
```

GMS operator APIs are unchanged. GES exposes game-scoped routes: `/api/v1/games/{gameId}/...`

## Responsibility Split

| Concern | GMS | GES Platform | GES Game Plugin |
|---------|-----|--------------|-----------------|
| Operator auth | ✓ | | |
| Player / session | ✓ | validates via GMS | |
| Wallet (normal / seamless) | ✓ | delegates to GMS | |
| Game catalog / launch URL | ✓ | sync metadata | provides metadata |
| HTTP API routing | | ✓ | |
| Launch token exchange | | ✓ | |
| Bet debit / win credit calls | | ✓ → GMS | |
| Math + settlement | | | ✓ |
| Game client UI | | serves static | ✓ per game |
| RTP simulator | | | ✓ per game |

## Launch Flow

```text
1. Operator  → GMS   POST /api/v1/players/login
2. Operator  → GMS   POST /api/v1/wallet/transfer        (normal wallet)
3. Operator  → GMS   POST /api/v1/games/launch
                     { gameId: "asian-tour-01", sessionId }
4. GMS       → Op    launchUrl:
                     https://play.vendor.com/play/asian-tour-01?launchToken=<jwt>
5. Player browser    loads client at /play/asian-tour-01/
6. Client    → GES   POST /api/v1/games/asian-tour-01/session/init
7. Client    → GES   GET  /api/v1/games/asian-tour-01/config
8. Client    → GES   POST /api/v1/games/asian-tour-01/spin
```

Launch token (GMS-signed JWT) contains: `sessionId`, `gameId`, `playerId`, `operatorId`, `currency`, `market`, `walletType`.

## Spin Flow (Any Game)

```text
GES spin orchestrator (shared):
  1. Resolve plugin by gameId from URL
  2. Validate gameSessionToken
  3. plugin.validateBet(bet)
  4. GMS internal API: wallet/debit { sessionId, gameId, amount, roundId }
  5. plugin.playRound(bet, rng, market)
  6. plugin.settle(result, market)
  7. GMS internal API: wallet/credit { sessionId, gameId, win, roundId }
  8. Return spin response + balance
```

GES never branches on wallet type — GMS handles normal vs seamless.

## Asian Tour — Current Code Migration

Today's monolithic `src/` becomes the first GES plugin:

| Current | GES target |
|---------|------------|
| `src/engine/` | `games/asian-tour-01/engine/` |
| `src/settlement/` | `games/asian-tour-01/settlement/` |
| `src/simulator/` | `games/asian-tour-01/simulator/` |
| `src/server/index.ts` | `platform/server/` (shared router) |
| `src/server/session.ts` | Replaced by GMS wallet + demo mode |
| `public/` | `clients/asian-tour-01/` |

Engine and settlement code move with minimal changes. Server integration is refactored into the shared platform.

## Adding More Games

1. Add `games/{new-game-id}/` implementing [GamePlugin](../../game-engine-service/docs/game-plugin-contract.md)
2. `registry.register()` at GES startup
3. Add `clients/{new-game-id}/`
4. Add GMS catalog entry with matching `gameId`

No GMS code changes beyond catalog. No new GES deployment.

## GMS Catalog ↔ GES Registry

```text
GMS (database)                         GES (runtime)
├── gameId: asian-tour-01              ├── plugin: asian-tour-01
├── launchPath: /play/asian-tour-01    ├── metadata (min/max bet, RTP)
├── thumbnail, marketing copy          └── health
└── operator allow list
```

GMS `POST /games/launch` builds URL from catalog `launchPath` + signed `launchToken`.

GES `GET /api/v1/games` (internal) lists registered plugins for sync jobs.

## API Quick Reference

| Actor | Endpoint |
|-------|----------|
| Operator → GMS | `POST /api/v1/players/login` |
| Operator → GMS | `POST /api/v1/games/launch` |
| Client → GES | `POST /api/v1/games/{gameId}/session/init` |
| Client → GES | `GET /api/v1/games/{gameId}/config` |
| Client → GES | `POST /api/v1/games/{gameId}/spin` |
| GES → GMS | `POST /internal/wallet/debit` (includes `gameId`) |
| GES → GMS | `POST /internal/wallet/credit` (includes `gameId`) |

## Further Reading

| Document | Content |
|----------|---------|
| [game-engine-service/ARCHITECTURE.md](../../game-engine-service/ARCHITECTURE.md) | GES layers, registry, session model |
| [game-engine-service/docs/repository-layout.md](../../game-engine-service/docs/repository-layout.md) | Migration from `src/` |
| [game-engine-service/docs/adding-a-game.md](../../game-engine-service/docs/adding-a-game.md) | Onboard new titles |
| [game-engine-service/docs/gms-integration.md](../../game-engine-service/docs/gms-integration.md) | Internal GMS API details |
