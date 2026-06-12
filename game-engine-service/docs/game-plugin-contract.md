# Game Plugin Contract

Every slot title in Game Engine Service (GES) implements `GamePlugin`. The platform layer calls this interface; it never imports game-specific math directly except through the registry.

## Interface (Conceptual)

```typescript
interface GamePlugin {
  /** Stable ID — must match GMS catalog and URL path */
  readonly gameId: string;

  /** Catalog metadata for GMS sync and GET /api/v1/games */
  readonly metadata: GameMetadata;

  /** Run one paid round; returns raw engine result */
  playRound(input: PlayRoundInput): SpinResult;

  /** Convert raw result to wallet-safe settled outcome */
  settle(result: SpinResult, market: Market): SettledSpinResult;

  /** Public config for game client (no secret math weights) */
  buildConfigResponse(market?: Market): GameConfigResponse;

  /** Validate bet amount against game rules */
  validateBet(betCents: number): BetValidationResult;

  /** Optional: game-specific health check (math profile loaded, etc.) */
  healthCheck?(): Promise<HealthCheckResult>;
}
```

## Supporting Types

```typescript
interface GameMetadata {
  gameId: string;
  name: string;
  code: string;           // e.g. "ASIAN-TOUR-01"
  version: string;
  category: "slots";
  minBet: string;
  maxBet: string;
  currencies: string[];
  markets: Market[];
  status: "active" | "maintenance" | "deprecated";
  rtp?: string;
  features?: string[];
}

interface PlayRoundInput {
  bet: number;
  rng: Rng;
  market: Market;
}

interface BetValidationResult {
  valid: boolean;
  error?: "bet_out_of_range" | "invalid_amount";
  minBet?: number;
  maxBet?: number;
}
```

## Implementation Rules

### 1. Pure math in `playRound`

- No HTTP, no wallet, no session access
- Deterministic given `(bet, rng sequence, math profile)`
- Same contract as current `playRound()` in Asian Tour

### 2. Settlement in `settle`

- All rounding and market caps happen here
- Platform passes `market` from GMS session context
- Returns `totalWin` in wallet-safe decimal form

### 3. Config in `buildConfigResponse`

- Safe for client consumption
- Must not expose reel weights or exact RTP tuning parameters
- Asian Tour reference: current `buildConfigResponse()` in `configResponse.ts`

### 4. Registration

Each game exports a factory from `games/{gameId}/plugin.ts`:

```typescript
// games/asian-tour-01/plugin.ts
export function createAsianTourPlugin(): GamePlugin {
  return {
    gameId: "asian-tour-01",
    metadata: { ... },
    playRound: (input) => playRound(input.bet, input.rng),
    settle: (result, market) => settleSpinResultDetailed(result, market),
    buildConfigResponse: (market) => buildAsianTourConfig(market),
    validateBet: (cents) => validateAsianTourBet(cents),
  };
}
```

Platform startup:

```typescript
import { createAsianTourPlugin } from "../games/asian-tour-01/plugin";
registry.register(createAsianTourPlugin());
```

## Asian Tour Mapping

| GamePlugin method | Current module |
|-------------------|----------------|
| `playRound` | `src/engine/spinEngine.ts` → `playRound` |
| `settle` | `src/settlement/settleSpin.ts` → `settleSpinResultDetailed` |
| `buildConfigResponse` | `src/server/configResponse.ts` → `buildConfigResponse` |
| `validateBet` | `src/engine/config.ts` → `BET.min` / `BET.max` |
| `metadata` | `overview.md` + `configResponse` game block |

## Spin Response Shape

Plugins return settled results; the **platform** wraps them into the HTTP response (balance from GMS, `roundId`, `gameId`):

```typescript
interface SpinHttpResponse {
  gameId: string;
  roundId: string;
  balance: number;
  bet: number;
  totalWin: number;
  capped: boolean;
  market: Market;
  // game-specific visual payload from plugin
  base: ...;
  freeSpins: ... | null;
}
```

Response shape can differ per game for UI fields, but wallet fields (`balance`, `bet`, `totalWin`, `roundId`) are consistent across all plugins.

## Simulator Ownership

Each game keeps its own simulator under `games/{gameId}/simulator/`. Simulators:

- Import only that game's engine and settlement
- Do not start the HTTP server
- Write artifacts to `games/{gameId}/artifacts/`

npm scripts (planned):

```json
{
  "sim:asian-tour": "tsx games/asian-tour-01/simulator/rtp.ts",
  "sim:dragon-fortune": "tsx games/dragon-fortune-02/simulator/rtp.ts"
}
```

## Adding a Plugin Checklist

1. Create `games/{gameId}/` with `engine/`, `settlement/`, `plugin.ts`
2. Implement all `GamePlugin` methods
3. Call `registry.register()` in platform bootstrap
4. Add client under `clients/{gameId}/`
5. Register `gameId` in GMS catalog
6. Run simulator + verify RTP before `status: "active"`

See [adding-a-game.md](adding-a-game.md).
