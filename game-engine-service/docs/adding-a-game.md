# Adding a New Slot Game

Step-by-step guide to register a new title in the unified Game Engine Service (GES) and expose it through GMS.

## Overview

```text
1. Implement game plugin (engine + settlement + config)
2. Register in GES registry
3. Add game client
4. Register in GMS catalog
5. Verify via simulator + integration tests
```

## Step 1 — Create Game Folder

```text
game-engine-service/games/{gameId}/
  engine/
  settlement/
  simulator/
  tests/
  artifacts/
  configResponse.ts
  spinResponse.ts
  plugin.ts
```

Use `asian-tour-01` as the reference implementation.

## Step 2 — Implement GamePlugin

```typescript
// games/dragon-fortune-02/plugin.ts
export function createDragonFortunePlugin(): GamePlugin {
  return {
    gameId: "dragon-fortune-02",
    metadata: {
      gameId: "dragon-fortune-02",
      name: "Dragon Fortune",
      code: "DRAGON-FORTUNE-02",
      version: "0.1.0",
      category: "slots",
      minBet: "0.20",
      maxBet: "200.00",
      currencies: ["USD"],
      markets: ["MGA", "Curacao"],
      status: "active",
    },
    playRound: (input) => playRound(input.bet, input.rng),
    settle: (result, market) => settleSpinResultDetailed(result, market),
    buildConfigResponse: () => buildDragonFortuneConfig(),
    validateBet: (cents) => validateBet(cents, MIN_BET, MAX_BET),
  };
}
```

## Step 3 — Register at Startup

```typescript
// platform/server/bootstrap.ts
import { createAsianTourPlugin } from "../../games/asian-tour-01/plugin";
import { createDragonFortunePlugin } from "../../games/dragon-fortune-02/plugin";

export function bootstrapRegistry(registry: GameRegistry) {
  registry.register(createAsianTourPlugin());
  registry.register(createDragonFortunePlugin());
}
```

No changes to route handlers or spin orchestrator.

## Step 4 — Add Client

```text
clients/dragon-fortune-02/
  game.html
  game.js
  game.css
  assets/
```

Client must:

- Read `gameId` from URL path (`/play/dragon-fortune-02/`)
- Call `POST /api/v1/games/dragon-fortune-02/session/init` with launch token
- Use `gameSessionToken` for config and spin calls

## Step 5 — Register in GMS

Add catalog entry (admin API or config):

```json
{
  "gameId": "dragon-fortune-02",
  "name": "Dragon Fortune",
  "category": "slots",
  "launchPath": "/play/dragon-fortune-02",
  "status": "active",
  "minBet": "0.20",
  "maxBet": "200.00",
  "currencies": ["USD"],
  "thumbnailUrl": "https://cdn.vendor.com/games/dragon-fortune/thumb.png"
}
```

Enable for target operators via allow list.

## Step 6 — Math Verification

```bash
npm run sim:dragon-fortune -- 1000000
npm run verify:dragon-fortune
```

Artifacts go to `games/dragon-fortune-02/artifacts/`. Do not share math profiles between games.

## Step 7 — Integration Test

| Step | Action |
|------|--------|
| 1 | GMS sandbox login |
| 2 | GMS launch `gameId: dragon-fortune-02` |
| 3 | Open launch URL |
| 4 | Spin at min bet |
| 5 | Verify GMS wallet ledger shows `gameId` |
| 6 | Reconcile round audit in GES logs |

## Maintenance Mode

Set plugin metadata `status: "maintenance"` or unregister from registry:

- GES returns 503 for spin
- GMS catalog can mirror status to hide from `GET /games`

Active sessions should drain gracefully (finish in-flight spins, reject new spins).

## What You Do NOT Need to Change

- Platform HTTP server
- GMS operator APIs
- GMS player/wallet components
- Other game plugins
