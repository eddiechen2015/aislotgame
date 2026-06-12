# Asian Tour (`asian-tour-01`)

First game plugin for Game Engine Service. Implementation currently lives in the legacy monolith at repository root:

| Legacy path | Will migrate to |
|-------------|-----------------|
| `src/engine/` | `games/asian-tour-01/engine/` |
| `src/settlement/` | `games/asian-tour-01/settlement/` |
| `src/simulator/` | `games/asian-tour-01/simulator/` |
| `src/server/configResponse.ts` | `games/asian-tour-01/configResponse.ts` |
| `src/server/spinResponse.ts` | `games/asian-tour-01/spinResponse.ts` |
| `public/` | `clients/asian-tour-01/` |

## Metadata

| Field | Value |
|-------|-------|
| gameId | `asian-tour-01` |
| code | `ASIAN-TOUR-01` |
| version | `0.2.0` |
| category | slots |
| mechanics | 243 ways, cascading, free spins |

## Plugin Entry Point (Planned)

`plugin.ts` will wrap existing `playRound`, `settleSpinResultDetailed`, and `buildConfigResponse` without changing math behavior.

See [../../docs/repository-layout.md](../../docs/repository-layout.md) for migration phases.
