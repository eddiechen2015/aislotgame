# Improvements Visual

## Overview

This document is a visual companion to [improvements.md](./improvements.md).  
It focuses on the architectural evolution of the slot engine and the engineering decisions that turned it from a working prototype into a production-grade game math platform.

---

## 1. Starting Point

At the beginning, the project looked like this:

```mermaid
flowchart TD
  A["Spin Request"] --> B["Math Engine"]
  B --> C["API Response"]
  C --> D["Wallet Update"]
  B --> E["RTP Simulation"]
```

This structure was simple, but too many responsibilities were mixed together:

- raw engine output
- wallet semantics
- API serialization
- simulation metrics

That made correctness fragile.

---

## 2. First Major Discovery

The first serious issue was that the ways evaluator was mathematically incorrect for capped per-way multipliers.

### Prototype Logic

```mermaid
flowchart TD
  A["Matching Positions"] --> B["Aggregate Wild Multipliers"]
  B --> C["Apply Spin Multiplier"]
  C --> D["Return Total Win"]
```

This was fast, but it silently broke when the rules required:

- per-way wild multiplier capping
- then free-spin multiplier
- then summation

### Fixed Logic

```mermaid
flowchart TD
  A["Matching Positions by Reel"] --> B["DP Over Per-Way Wild States"]
  B --> C["Cap Wild Multiplier Per Way"]
  C --> D["Apply Spin Multiplier"]
  D --> E["Sum Exact Outcome Set"]
```

This preserved correctness while keeping the evaluator efficient.

---

## 3. Expanding Wild Constraints Across Cascades

Originally, `max_wilds_per_spin` only applied to the initial grid:

```mermaid
flowchart LR
  A["Initial Grid Generation"] --> B["Wild Cap Applied"]
  B --> C["Cascades and Refills"]
  C --> D["No Further Wild Enforcement"]
```

That meant a refill could produce more wilds than the spin was supposed to allow.

### Corrected Flow

```mermaid
flowchart LR
  A["Initial Grid Generation"] --> B["Wild Cap Applied"]
  B --> C["Cascade Refill"]
  C --> D["Wild Cap Re-applied"]
  D --> E["Demote Refill Wilds First"]
```

This kept the spin compliant without destabilizing surviving wild helpers.

---

## 4. Engine vs Settlement Separation

One of the most important structural changes was splitting raw math from real-money settlement.

### Before

```mermaid
flowchart TD
  A["playRound()"] --> B["Raw Floating-Point Win"]
  B --> C["Wallet Rounded Separately"]
  B --> D["API Exposed Raw Totals"]
  B --> E["Simulator Measured Raw RTP"]
```

Problem:

- wallet RTP
- API RTP
- simulator RTP

could diverge.

### After

```mermaid
flowchart TD
  A["playRound()"] --> B["Raw SpinResult"]
  B --> C["Settlement Layer"]
  C --> D["Atomic Event Rounding"]
  D --> E["Market Caps"]
  E --> F["Settled Result"]
  F --> G["Wallet Update"]
  F --> H["API Response"]
  F --> I["Simulator Metrics"]
```

This is the point where the system stopped behaving like a demo and started behaving like a money engine.

---

## 5. Market-Specific Absolute Win Caps

Another key step was introducing market-specific caps:

```mermaid
flowchart TD
  A["Raw Settled Spin Win"] --> B["Multiplier Cap"]
  B --> C["Absolute Market Cap"]
  C --> D["Paid Win"]
  C --> E["Audit Event if Capped"]
```

Instead of only enforcing:

- `10000x * bet`

the engine now enforces:

- `min(10000x * bet, absolute_cap_by_market)`

That is a production necessity, not a cosmetic feature.

---

## 6. Reel Model Evolution

### Prototype Reel Model

```mermaid
flowchart TD
  A["Each Visible Cell"] --> B["Independent Weighted Pick"]
```

That model is easy to code, but does not behave like a real slot reel strip.

### Production-Oriented Reel Model

```mermaid
flowchart TD
  A["Reel Strip"] --> B["Random Stop Position"]
  B --> C["Visible Window"]
  C --> D["Grid"]
```

Why this matters:

- scatter visibility depends on window exposure
- adjacent symbol placement matters
- tuning reel counts is not enough without strip-aware behavior

---

## 7. Runtime Math Profiles

To tune math safely, the engine needed more than static config.

### Added Capability

```mermaid
flowchart TD
  A["Default Static Config"] --> B["Runtime Math Profile"]
  B --> C["Scoped Override"]
  C --> D["Simulation / Search"]
  D --> E["Automatic Rollback"]
```

This made it possible to:

- test base/FS paytable variants
- test base/FS reel-set variants
- search over math candidates in memory
- avoid rewriting source files for each experiment

---

## 8. Free-Spin Math Freedom

The next architectural breakthrough was giving free spins their own math identity.

### Before

```mermaid
flowchart TD
  A["Base Spin"] --> B["Shared Reel Set"]
  C["Free Spins"] --> B
  A --> D["Shared Paytable"]
  C --> D
```

This made it hard to shape feature RTP independently.

### After

```mermaid
flowchart TD
  A["Base Spin"] --> B["Base Reel Set"]
  A --> C["Base Paytable"]
  D["Free Spins"] --> E["FS Reel Set"]
  D --> F["FS Paytable"]
```

That one structural change unlocked the ability to tune:

- total RTP
- base RTP
- free-spin RTP

with much more control.

---

## 9. Search Workflow

The project then evolved from static math into a search-driven workflow:

```mermaid
flowchart TD
  A["Default Math Profile"] --> B["Export Profile"]
  B --> C["Search Candidates"]
  C --> D["Coarse Search"]
  D --> E["Refine Search"]
  E --> F["Verify Top Candidates"]
  F --> G["Artifacts/searchRtp.latest.json"]
  G --> H["Human Review / Promotion Decision"]
```

This made the system operationally useful for math iteration, not just technically correct.

---

## 10. Verification Workflow

Candidate search alone is not enough.

Profiles need their own verification path:

```mermaid
flowchart TD
  A["Profile JSON"] --> B["Runtime Validation"]
  B --> C["Scoped Injection"]
  C --> D["Monte Carlo Verification"]
  D --> E["RTP Summary"]
```

That is now provided by:

- `sim:export-profile`
- `sim:verify`
- `sim:search`

---

## 11. Test Safety Net

As flexibility increased, regressions became more dangerous.

The project added deterministic math tests covering:

- exact per-way cap behavior
- mixed capped/uncapped way sets
- free-spin paytable routing
- max wilds across cascades
- market cap behavior
- atomic rounding semantics
- runtime override reset behavior
- invalid profile rejection

### Test Role in the Architecture

```mermaid
flowchart TD
  A["Engine Change"] --> B["Unit Tests"]
  C["Settlement Change"] --> B
  D["Profile Workflow Change"] --> B
  B --> E["Math Invariants Protected"]
```

---

## 12. Final Shape of the System

By the end of the work, the architecture looked like this:

```mermaid
flowchart TD
  A["Client / Simulator"] --> B["Engine"]
  B --> C["Raw SpinResult"]
  C --> D["Settlement Layer"]
  D --> E["Wallet / API"]
  D --> F["Audit Events"]
  G["Math Profile System"] --> B
  H["Search / Verify Tools"] --> G
  I["Unit Tests"] --> B
  I --> D
  I --> G
```

This is the architecture of a platform, not just a single game implementation.

---

## 13. What This Case Study Shows

The most important lesson is not “AI can write code”.

The stronger lesson is:

- AI can be used to iteratively audit a system
- isolate correctness problems
- redesign boundaries
- add tooling around the core
- and turn a prototype into a maintainable platform

This project is a concrete example of AI-assisted game programming at the systems level, not just at the snippet level.
