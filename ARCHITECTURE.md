# Architecture

## Purpose

This document describes the internal architecture of the Asian Tour slot engine.
It is intended for engineers who need to maintain, extend, or integrate the system.

The codebase is designed around one core principle:

- keep raw math execution, real-money settlement, transport APIs, and math-tuning workflows separate

That separation is what allows the project to support deterministic math simulation, market-specific payout caps, repeatable RTP search, and production-grade settlement behavior without turning the engine into a single monolithic module.

## System Overview

The project has five main layers:

1. Engine
   Pure slot math execution. Produces raw `SpinResult` objects.

2. Settlement
   Converts raw engine results into credited player outcomes.

3. Server
   Exposes HTTP APIs and manages sessions, balances, and audit logging.

4. Simulator
   Runs Monte Carlo validation, RTP searches, profile export, and profile verification.

5. Browser Harness
   Provides a lightweight UI for manual inspection of spin results.

## Repository Map

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

  simulator/
    rtp.ts
    searchRtp.ts
    verifyProfile.ts
    exportDefaultProfile.ts
    spinTest.ts

  tests/
    run.ts

public/
  index.html
```

## Layer Responsibilities

### Engine Layer

The engine is responsible for raw slot logic only.

Its inputs are:

- bet
- RNG
- runtime math profile

Its outputs are:

- raw grids
- cascade traces
- free-spin traces
- raw win values before wallet settlement semantics

The engine does not own:

- rounding to currency precision
- market absolute caps
- balance updates
- transport formatting

This is implemented mainly in:

- `spinEngine.ts`
- `cascade.ts`
- `waysEvaluator.ts`
- `freeSpins.ts`
- `reel.ts`

### Settlement Layer

The settlement layer is the bridge between mathematical outcome and real-money outcome.

It applies:

- atomic payout-event rounding
- per-spin cap handling
- market absolute win cap handling
- audit event construction

This lives in `src/settlement/settleSpin.ts`.

### Server Layer

The server is a thin integration harness around the engine and settlement layer.

It owns:

- sessions
- balances
- market selection
- API serialization
- audit logging

It does not duplicate math logic. It consumes settled outcomes and updates wallet state.

### Simulator Layer

The simulator layer is used for:

- baseline RTP measurement
- profile export
- profile verification
- automated RTP/profile search

It is intentionally separate from the HTTP server so large Monte Carlo runs stay deterministic and isolated from transport concerns.

### Browser Harness

The browser harness is a debugging and visualization aid.

It is not part of core math correctness. It exists so engineers and designers can inspect:

- initial grids
- cascade chains
- free-spin sequences
- raw JSON responses

## Core Data Models

### Raw Math Types

Defined in `src/engine/types.ts`.

Important types:

- `Cell`
- `Grid`
- `WaysWin`
- `CascadeStep`
- `SpinResultBase`
- `FreeSpinSession`
- `SpinResult`

These types describe raw engine output.

### Runtime Math Profile

Defined in `src/engine/mathRuntime.ts`.

The runtime math profile is the abstraction that allows the engine to run with different mathematical configurations without rewriting source files.

Current profile fields include:

- `baseSymbols`
- `freeSpinSymbols`
- `baseScatterPayoutXBet`
- `baseReelSymbolCounts`
- `baseReelStripOrders`
- `freeSpinReelSymbolCounts`
- `freeSpinReelStripOrders`
- `payableSymbols`

This profile is validated by `validateMathConfig.ts` before being accepted.

### Settled Outcome

The settlement layer transforms a raw `SpinResult` into:

- credited `totalWin`
- credited base and free-spin component totals
- capped outcomes
- audit events

This separation is essential because raw engine output and wallet-credit output are intentionally not identical.

## Spin Execution Lifecycle

### 1. Round Entry

`playRound(bet, rng)` validates the bet and starts the base spin.

### 2. Base Spin

`runSpin()`:

- generates the initial grid
- evaluates ways
- removes winning positions
- applies gravity and refill
- repeats until no win or cascade cap
- counts scatter visibility
- determines scatter pay and free-spin trigger

### 3. Free Spins

If triggered, `runFreeSpins()` executes:

- initial 10 spins
- +5 spins per retrigger
- max retrigger count
- multiplier progression
- dedicated `free_spins` reel set

### 4. Raw Round Result

The engine returns a raw `SpinResult` containing:

- base game trace
- optional free-spin session trace
- raw total win

### 5. Settlement

`settleSpinResultDetailed()` converts the raw result into a settled one by:

- rounding independent payout events
- summing in integer cents
- applying market caps
- generating audit events

### 6. Balance Update

The server debits bet cents, credits settled win cents, and returns the final API response.

## Reel System Design

The reel model is not an independent weighted pick per cell.

It uses:

- deterministic strips
- random stop positions
- visible windows

This matters because:

- symbol visibility frequency depends on neighboring strip placement
- scatter frequency depends on window exposure, not just raw counts
- free-spin tuning needs separate reel-set control

The reel layer also enforces:

- max wilds per spin
- post-cascade wild correction

## Ways Evaluation Design

The 243-ways evaluator has the following properties:

- left-to-right only
- must start from reel 1
- minimum 3 matching reels
- no wild-only wins
- highest match length only
- per-way wild multiplier cap

To avoid brute-forcing every possible path, the evaluator uses dynamic programming to aggregate capped per-way wild multipliers efficiently.

## Free-Spin Design

Free spins are implemented as a separate state machine rather than as a flag inside a single spin loop.

This makes it easier to manage:

- retrigger rules
- multiplier progression
- per-spin cap behavior
- dedicated free-spin reel and paytable configurations

The free-spin module currently assumes:

- same global feature structure
- separate reel set available
- separate paytable available

## Settlement Design

Settlement is intentionally strict and deterministic.

Key rules:

- round only atomic payout events
- sum in cents
- apply market cap after event rounding
- keep audit metadata for capped results

This avoids the common failure mode where simulator RTP, API RTP, and credited wallet RTP diverge.

## Runtime Math Profiles

The runtime profile system exists so that math experiments do not require source edits.

Three important utilities support this:

- `buildDefaultRuntimeMathConfig()`
- `setRuntimeMathConfig()`
- `withRuntimeMathConfig()`

The preferred pattern for simulation and search code is `withRuntimeMathConfig()` because it scopes overrides safely and restores the previous profile automatically.

## Search and Verification Pipeline

The current math workflow supports:

1. Export the current default profile
2. Search for better candidate profiles
3. Verify a candidate independently
4. Decide whether to promote the candidate into static config

Artifacts are written under `artifacts/`.

This is an intentional architecture choice: math tuning is treated as a workflow around the engine, not as ad hoc edits inside the engine.

## Server Integration Model

The server is intentionally lightweight.

It is not the production NestJS implementation yet, but it mirrors the intended module boundaries:

- auth/session boundary
- spin orchestration boundary
- config exposure boundary

Current storage is in-memory only.
That is acceptable for a math harness, but not for a real-money deployment.

## Test Strategy

The codebase currently uses deterministic unit tests for invariants that must never regress.

Coverage includes:

- per-way cap correctness
- free-spin paytable routing
- max wild enforcement
- market cap correctness
- rounding semantics
- runtime override safety
- invalid profile rejection

This test strategy is more valuable than snapshot-style UI testing at this stage because math correctness is the primary production risk.

## Production Readiness Assessment

The engine architecture is now close to production-grade because it supports:

- strict separation of concerns
- deterministic testing
- runtime profile injection
- profile validation
- real-money settlement semantics
- market-aware caps and audit trails
- repeatable RTP search tooling

What is still not fully “production complete” is the default math profile itself. The architecture is ready for production workflows even if the final tuned profile still requires iteration.

## Recommended Extension Points

The safest places to extend the system are:

- `config.ts` for static approved math
- `mathProfile.ts` for default profile construction
- `mathRuntime.ts` for runtime override behavior
- `searchRtp.ts` for new tuning dimensions
- `settleSpin.ts` for market- or wallet-specific settlement policies

Avoid adding business rules directly into `waysEvaluator.ts` or `reel.ts` unless they are fundamental engine rules.

## Common Architecture Mistakes To Avoid

- Do not mix rounding logic back into the engine layer
- Do not mutate static config during simulations
- Do not bypass profile validation
- Do not add market logic directly into raw math modules
- Do not treat simulator output as wallet output unless it has gone through settlement

## Summary

The architecture is designed around a stable core engine plus a flexible math workflow.

That means:

- the engine can stay deterministic and testable
- settlement can stay market-safe
- simulations can stay reproducible
- tuning can stay iterative without destabilizing production behavior

This separation is the reason the project can evolve from a single slot prototype into a maintainable long-term slot math platform.
