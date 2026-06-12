# Repository Layout & Migration

How the current monolithic `src/` layout maps into the unified **Game Engine Service** structure.

## Target Structure

```text
aislotgame/
├── game-management-backend/     # GMS (.NET) — operator platform
├── game-engine-service/         # GES — this document's root
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── docs/
│   ├── platform/
│   │   ├── server/
│   │   │   ├── index.ts              # HTTP host
│   │   │   ├── routes/
│   │   │   │   ├── games.ts          # /api/v1/games/{gameId}/*
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # gameSessionToken
│   │   │   │   ├── gameResolver.ts   # registry lookup
│   │   │   │   └── rateLimiter.ts
│   │   │   └── spinOrchestrator.ts   # debit → play → settle → credit
│   │   ├── gms/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── registry/
│   │   │   ├── registry.ts
│   │   │   └── types.ts              # GamePlugin interface
│   │   └── shared/
│   │       ├── money.ts
│   │       ├── markets.ts
│   │       ├── audit.ts
│   │       ├── roundId.ts
│   │       ├── spinLock.ts
│   │       └── wallet/
│   │           ├── provider.ts         # interface
│   │           ├── memory.ts           # demo
│   │           └── gms.ts              # production
│   ├── games/
│   │   ├── asian-tour-01/
│   │   │   ├── engine/                 # from src/engine/
│   │   │   ├── settlement/             # from src/settlement/
│   │   │   ├── simulator/              # from src/simulator/
│   │   │   ├── tests/                  # from src/tests/
│   │   │   ├── artifacts/              # from artifacts/ (game-specific)
│   │   │   └── plugin.ts
│   │   └── dragon-fortune-02/            # future
│   │       └── ...
│   └── clients/
│       ├── asian-tour-01/              # from public/
│       │   ├── index.html
│       │   ├── game.html
│       │   ├── game.js
│       │   └── game.css
│       └── shared/                       # optional shared UI utilities
├── src/                         # LEGACY — remove after migration
├── public/                      # LEGACY — remove after migration
└── ARCHITECTURE.md              # Asian Tour math doc — keep, link from game plugin
```

## Migration Map

| Current path | Target path | Notes |
|--------------|-------------|-------|
| `src/engine/*` | `game-engine-service/games/asian-tour-01/engine/*` | Move as-is |
| `src/settlement/*` | `game-engine-service/games/asian-tour-01/settlement/*` | Move as-is |
| `src/simulator/*` | `game-engine-service/games/asian-tour-01/simulator/*` | Update import paths |
| `src/tests/*` | `game-engine-service/games/asian-tour-01/tests/*` | Per-game tests |
| `src/gameMarkets.ts` | `game-engine-service/platform/shared/markets.ts` | Shared across games |
| `src/server/money.ts` | `game-engine-service/platform/shared/money.ts` | Shared |
| `src/server/audit.ts` | `game-engine-service/platform/shared/audit.ts` | Add `gameId` field |
| `src/server/auditRng.ts` | `game-engine-service/platform/shared/auditRng.ts` | Shared |
| `src/server/roundId.ts` | `game-engine-service/platform/shared/roundId.ts` | Shared |
| `src/server/rateLimiter.ts` | `game-engine-service/platform/server/middleware/rateLimiter.ts` | Shared |
| `src/server/spinResponse.ts` | `games/asian-tour-01/spinResponse.ts` | Game-specific response builder |
| `src/server/configResponse.ts` | `games/asian-tour-01/configResponse.ts` | Called from plugin |
| `src/server/session.ts` | Split: demo → `platform/shared/wallet/memory.ts`; prod → GMS | |
| `src/server/index.ts` | `platform/server/` routes + `spinOrchestrator.ts` | Major refactor |
| `public/*` | `clients/asian-tour-01/*` | Update API paths to include `gameId` |
| `artifacts/*` | `games/asian-tour-01/artifacts/*` | Per-game math profiles |
| Root `package.json` | `game-engine-service/package.json` or workspace root | npm workspaces optional |

## Migration Phases

### Phase 1 — Scaffold (no behavior change)

- Create `game-engine-service/` folders
- Copy (not move) `src/engine` → `games/asian-tour-01/engine`
- Add `plugin.ts` wrapping existing functions
- Keep `src/` working for backward compatibility

### Phase 2 — Platform extraction

- Extract shared modules to `platform/shared/`
- Implement registry + `gameResolver` middleware
- Implement unified routes with hardcoded `asian-tour-01`

### Phase 3 — GMS wallet boundary

- Add `WalletProvider` interface
- Replace `session.balanceCents` in spin orchestrator
- Add `session/init` launch token flow

### Phase 4 — Client update

- Move `public/` → `clients/asian-tour-01/`
- Client calls `/api/v1/games/asian-tour-01/...`
- GMS launch URL: `/play/asian-tour-01?launchToken=...`

### Phase 5 — Cleanup

- Remove legacy `src/` and `public/`
- Update root README and npm scripts
- Point CI to `game-engine-service/`

### Phase 6 — Second game

- Add `games/dragon-fortune-02/` as proof of plugin model
- No platform changes beyond `registry.register()`

## npm Workspaces (Optional)

```json
{
  "name": "aislotgame",
  "private": true,
  "workspaces": [
    "game-engine-service"
  ]
}
```

Or keep a single `game-engine-service/package.json` as the only TS package.

## Import Path Convention

```typescript
// Platform imports game only via registry — never deep import
import { getGame } from "../registry/registry";
const plugin = getGame("asian-tour-01");

// Game plugin imports its own engine
import { playRound } from "./engine/spinEngine";
```

**Forbidden:** `platform/server` importing `games/dragon-fortune-02/engine` directly.

## Static Asset Routing

```text
GET /play/:gameId/*     → clients/:gameId/*
GET /play/:gameId       → clients/:gameId/game.html
```

Launch URL from GMS:

```text
https://play.vendor.com/play/asian-tour-01?launchToken=...
```
