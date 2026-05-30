# Asian Tour Slot Engine Architecture Guide

## 1. Project Scope

This project is a production-oriented TypeScript slot math engine and test platform.
It is not just a playable demo; it is designed to support the full lifecycle of slot math development:

- deterministic math execution
- auditable settlement
- market-specific payout caps
- tunable math profiles
- automated RTP/profile search and verification
- approved-profile runtime gating
- RNG-trace audit replay
- statistical verification reports
- server and browser-based integration testing

The current game is a 5x3, 243-ways cascading slot with wild multipliers and free spins.

---

## 2. High-Level Architecture

The system is organized into five layers:

1. `engine/`
   Pure math engine. Responsible for grid generation, ways evaluation, cascades, free spins, and raw spin outcomes.

2. `settlement/`
   Settlement layer. Converts raw engine results into real-money outcomes, including 2-decimal rounding, absolute win caps, and audit events.

3. `server/`
   Express-based test server. Exposes login/spin/config APIs and manages sessions, balances, markets, and audit logging.

4. `simulator/`
   Math verification and tuning layer. Runs Monte Carlo RTP simulations, profile export, profile verification, and automatic RTP search.

5. `public/`
   Browser test harness for visual inspection of grids, cascades, free spins, and raw JSON responses.

---

## 3. Directory Layout

```text
src/
  engine/
    config.ts
    types.ts
    rng.ts
    reel.ts
    waysEvaluator.ts
    cascade.ts
    freeSpins.ts
    spinEngine.ts
    mathRuntime.ts
    mathProfile.ts
    validateMathConfig.ts

  settlement/
    settleSpin.ts

  server/
    index.ts
    session.ts
    money.ts
    spinResponse.ts
    audit.ts
    auditRng.ts
    configResponse.ts
    roundId.ts

  simulator/
    rtp.ts
    searchRtp.ts
    verifyProfile.ts
    verifyProfileBatch.ts
    promoteProfile.ts
    exportDefaultProfile.ts
    auditVerify.ts
    spinTest.ts

  tests/
    run.ts

public/
  index.html
```

---

## 4. End-to-End Spin Flow

The full round pipeline works like this:

1. A client or simulator calls `playRound(bet, rng)`  
   Entry point: [src/engine/spinEngine.ts](/Users/eddiechen/mycode/slotgametest/testsgbyai/src/engine/spinEngine.ts)

2. `playRound()` executes the base spin via `runSpin()`

3. `runSpin()` handles:
   - initial grid generation
   - ways evaluation
   - symbol removal
   - cascade refill
   - scatter counting
   - free-spin trigger detection

4. If free spins are triggered, control moves into `runFreeSpins()`  
   Managed by [src/engine/freeSpins.ts](/Users/eddiechen/mycode/slotgametest/testsgbyai/src/engine/freeSpins.ts)

5. The engine returns a raw `SpinResult`

6. The settlement layer applies:
   - atomic event rounding
   - per-spin caps
   - market absolute caps
   - audit event generation

7. The server maps the settled result to an API response and updates the player balance

---

## 5. Engine Layer

### 5.1 `config.ts`

Static configuration source for:

- bet range
- exposure limits
- scatter payouts
- base paytable
- free-spin paytable
- base reel counts / strip order
- free-spin reel counts / strip order

This enables:

- separate base and free-spin reel sets
- separate base and free-spin paytables

### 5.2 `rng.ts`

Provides two RNG modes:

- `mulberry32(seed)` for deterministic simulations
- `defaultRng()` for non-seeded play

### 5.3 `reel.ts`

Handles reel strip generation and visible window sampling.

The model is no longer “independent weighted pick per cell”.
It is now:

- deterministic reel strips
- random stop positions
- visible windows

This module also handles:

- wild multiplier assignment
- max wilds per spin
- post-cascade wild re-check

### 5.4 `waysEvaluator.ts`

Responsible for 243-ways payout evaluation.

Key behaviors:

- only left-to-right prefixes starting from reel 1 qualify
- wild-only wins are disallowed
- only the highest matching length is paid
- wild multiplier cap is enforced per way
- DP is used instead of brute-force enumeration of all 243 paths

### 5.5 `cascade.ts`

Responsible for:

- removing winning positions
- gravity
- refill
- max wild enforcement after refill
- scatter counting
- 20-cascade cap

### 5.6 `freeSpins.ts`

Responsible for:

- 10 initial spins
- +5 spins per retrigger
- max 5 retriggers
- multiplier steps `[1,2,3,5,10]`
- using the dedicated `free_spins` reel set

### 5.7 `spinEngine.ts`

Top-level round orchestrator.

Responsible for:

- bet validation
- base spin
- scatter payout
- free-spin session
- round-level aggregation

---

## 6. Runtime Math Profile System

This is the key reason the project is now production-grade instead of being a static prototype.

### 6.1 `mathRuntime.ts`

The system no longer depends only on static config.
It supports runtime injection of complete math profiles:

- `baseSymbols`
- `freeSpinSymbols`
- `baseScatterPayoutXBet`
- `baseReelSymbolCounts`
- `freeSpinReelSymbolCounts`
- `baseReelStripOrders`
- `freeSpinReelStripOrders`

### 6.2 `withRuntimeMathConfig()`

Provides scoped runtime overrides:

- install a temporary profile
- run simulation/search logic inside that scope
- automatically restore the previous profile

This prevents search experiments from contaminating the default server profile.

### 6.3 `validateMathConfig.ts`

Validates profiles before they are accepted:

- exact reel count
- non-negative integer counts
- non-empty strip orders
- non-negative paytable values

### 6.4 Runtime Approved-Profile Gate

Production-like startup can require a profile to be both approved and verified:

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

`NODE_ENV=production` enables the same gate.

The loader rejects profiles that are still `candidate`, `verified` but not
approved, `rejected`, or missing passed verification metadata.

---

## 7. Settlement Layer

### 7.1 `settlement/settleSpin.ts`

The settlement layer converts raw engine output into real-money results.

It handles:

- atomic event rounding
  only independent payout events are rounded

- per-spin cap
  `10000x * bet`

- market absolute cap
  `min(10000x * bet, market absolute cap)`

- audit event generation

### 7.2 Why Settlement Is Separate

Raw math output and wallet-credit output are not the same thing.

Separating them makes it possible to support:

- math validation
- wallet consistency
- market rules
- auditability

---

## 8. Server Layer

### 8.1 `server/index.ts`

Express test server exposing:

- `POST /api/login`
- `GET /api/me`
- `POST /api/spin`
- `GET /api/config`

### 8.2 `session.ts`

Each session includes:

- token
- username
- market
- balance in integer cents

### 8.3 `money.ts`

Centralized money helpers:

- `amountToCents()`
- `centsToAmount()`
- `parseAmountToCents()`

### 8.4 `audit.ts`

Records absolute-cap audit events.

### 8.5 Audit RNG Tracing

Server spins use an audited RNG wrapper that records every RNG call:

- `next`
- `nextInt`
- `pickWeighted`

The recorded trace can later be used by `audit:verify` to replay the round
against the same math profile.

---

## 9. Simulation and Math Workflow

### 9.1 `rtp.ts`

Standard Monte Carlo simulation runner.

Reports:

- RTP
- base RTP
- free-spin RTP
- hit frequency
- free-spin frequency
- max win
- volatility proxy

### 9.2 `searchRtp.ts`

Automatic RTP/profile search tool.

Current search space includes:

- per-symbol base paytable scales
- per-symbol free-spin paytable scales
- separate 3/4/5 scatter payout scales
- base reel-count deltas
- free-spin reel-count deltas

Workflow:

1. coarse search
2. refine search
3. common-random-number comparison inside each stage
4. adaptive racing to allocate larger spin budgets only to survivors
5. multi-seed finalist verification
6. write `artifacts/searchRtp.latest.json`
7. write `artifacts/searchRtp.bestCandidate.mathProfile.json`

Candidates are scored using normalized target error:

```text
abs(actual - target) / tolerance
```

The score considers total RTP, base/FS split, hit frequency, free-spin
frequency, volatility, max-win exposure, and cross-seed stability. Candidate
evaluation can run in parallel through `worker_threads`.

### 9.3 `verifyProfile.ts`

Verifies any exported math profile independently.

### 9.4 `verifyProfileBatch.ts`

Verifies a profile across multiple deterministic seeds.

The report includes:

- aggregate metrics
- per-seed metrics
- sample standard deviation
- standard error
- 95% confidence interval
- normalized target error
- pass/fail result against profile targets

### 9.5 `promoteProfile.ts`

Promotes a verified profile to `approved`.

Promotion fails unless the profile includes passed batch verification metadata.

### 9.6 `auditVerify.ts`

Verifies recorded round audit events.

Without a profile path, it performs structural and accounting checks.

With a profile path, it replays the recorded RNG trace and compares:

- raw engine output
- settled payout output
- cap events
- wallet debit/credit accounting
- full RNG trace consumption

### 9.7 `exportDefaultProfile.ts`

Exports the current default profile to:

- `artifacts/default.mathProfile.json`

---

## 10. Test Coverage

`src/tests/run.ts` currently verifies:

- per-way multiplier cap
- mixed-way cap correctness
- free-spin paytable override behavior
- max wilds across cascades
- absolute cap by market
- atomic event rounding
- runtime override reset/cache behavior
- invalid profile rejection
- approved-profile runtime gate
- audit RNG trace recording
- round audit structure
- audit replay success/failure behavior

This gives the math team confidence that parameter tuning will not silently break engine semantics.

---

## 11. Maturity Assessment

From an engineering perspective, the project is now close to a production-grade slot engine:

- clear module boundaries
- engine/settlement separation
- runtime-replaceable math profiles
- auditable market caps
- search and verification tooling
- statistical verification reports
- approved-profile runtime gate
- RNG-trace replay for audit events
- regression tests

However:

- **engine maturity**: close to production-grade
- **default math profile maturity**: still under active tuning

The architecture is ready for production workflows even if the final math profile is not yet signed off.

---

## 12. Recommended Workflow

### Development

```bash
npm install
npm run dev
```

### Unit tests

```bash
npm run test:unit
```

### Standard RTP simulation

```bash
npm run sim -- 200000 1 42 MGA
```

### Export current default profile

```bash
npm run sim:export-profile
```

### Verify a profile

```bash
npm run sim:verify -- artifacts/default.mathProfile.json 100000 42 MGA
```

### Verify a profile across multiple seeds

```bash
npm run sim:verify-batch -- artifacts/default.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/default.verifyBatch 4
```

### Promote a verified profile

```bash
npm run sim:promote-profile -- artifacts/default.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

### Run with an approved profile gate

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

### Search for better profiles

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

### Verify and replay a round audit event

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx artifacts/approved.mathProfile.json
```

---

## 13. Suggested Next Steps

If the project continues toward full production readiness, the next natural improvements are:

- multi-seed long-run verification
- profile versioning
- timestamped search candidate archive
- CI math regression baselines
- certified RNG provider integration
- persistent session and wallet storage
- idempotent spin transactions
- scatter spacing / clustering as explicit search parameters

---

## 14. Summary

The project is no longer just a slot demo.
It is now a complete system composed of:

- a math engine
- a real-money settlement layer
- a test server
- an RTP optimization platform
- a math profile workflow
- an approved-profile runtime gate
- an audit replay workflow

If your goal is long-term slot math development with repeatable validation and tuning, this structure is already capable of supporting a serious production workflow.
