# Game Engine Service (GES)

A single TypeScript service that hosts **multiple slot games** behind one HTTP API. All games integrate with operators through the [Game Management Backend (GMS)](../game-management-backend/README.md).

## Purpose

Today the repository implements one title (Asian Tour) as a monolith under `src/`. GES is the target architecture: one deployable service, many game plugins, shared platform code for GMS integration, sessions, wallets, and audit.

```text
Operator ──► GMS (.NET) ──► Game Engine Service (TS) ──► Game Clients
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Asian Tour    Dragon Fortune   (future)
```

## Why One Service, Many Games

| Approach | Pros | Cons |
|----------|------|------|
| **One service per game** | Independent deploy, certify per title | Duplicated platform code, many deployments |
| **Unified GES (chosen)** | Shared GMS integration, one ops surface, easier catalog | Larger binary; isolate games by plugin boundary |

Games remain **logically isolated** via a plugin contract. Math, settlement, and RTP tooling stay per-game. Only transport, wallet, and session plumbing are shared.

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Platform vs game layers, registry, request routing |
| [docs/repository-layout.md](docs/repository-layout.md) | Folder structure and migration from current `src/` |
| [docs/game-plugin-contract.md](docs/game-plugin-contract.md) | Interface every game must implement |
| [docs/gms-integration.md](docs/gms-integration.md) | How GES talks to GMS |
| [docs/adding-a-game.md](docs/adding-a-game.md) | Checklist to onboard a new slot title |
| [docs/client-integration.md](docs/client-integration.md) | Launch URLs and per-game clients |

## Unified API Surface

All games share the same route pattern; `gameId` selects the plugin:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/games/{gameId}/session/init` | Validate GMS launch token; open game session |
| `GET` | `/api/v1/games/{gameId}/config` | Public config for client UI |
| `POST` | `/api/v1/games/{gameId}/spin` | Spin (wallet via GMS) |
| `GET` | `/api/v1/games/{gameId}/health` | Per-game liveness |
| `GET` | `/api/v1/health` | Service liveness |
| `GET` | `/api/v1/games` | List registered games (internal / GMS sync) |

## Registered Games (Planned)

| gameId | Title | Status |
|--------|-------|--------|
| `asian-tour-01` | Asian Tour | Exists — migrate from `src/` |
| `dragon-fortune-02` | Dragon Fortune | Placeholder |
| *(add via plugin)* | | |

## Relationship to Current Codebase

| Current location | GES target |
|------------------|------------|
| `src/engine/`, `src/settlement/`, `src/simulator/` | `games/asian-tour-01/` |
| `src/server/` | `platform/server/` (shared) + thin game routing |
| `src/gameMarkets.ts` | `platform/shared/markets/` |
| `public/` | `clients/asian-tour-01/` |

See [docs/repository-layout.md](docs/repository-layout.md) for the full migration map.

## Project Status

**Phase: Architecture & repository planning**

- [x] Multi-game service design
- [x] Game plugin contract defined
- [x] GMS integration model updated
- [ ] Physical code migration from `src/`
- [ ] Game registry implementation
- [ ] GMS wallet client
