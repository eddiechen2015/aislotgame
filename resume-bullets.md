# Resume Bullet Points

## Short Version

- Refactored a TypeScript slot game prototype into a production-oriented math engine with deterministic simulation, auditable settlement, market-aware payout caps, and runtime-configurable math profiles.
- Implemented exact per-way multiplier capping, separate base/free-spin reel sets and paytables, and automated RTP optimization tooling for iterative game-math tuning.
- Built Monte Carlo search and verification workflows for slot math profiles, including profile export, validation, regression tests, and settled-value RTP measurement.

## Medium Version

- Engineered a production-grade TypeScript slot math platform from an existing 243-ways cascading slot prototype, separating raw engine logic, real-money settlement, market cap enforcement, API response shaping, and simulation workflows.
- Replaced incorrect aggregated payout logic with an exact DP-based per-way multiplier evaluation model, ensuring mathematically correct capped wild multiplier behavior under both base-game and free-spin rules.
- Introduced dedicated base and free-spin reel sets and paytables, enabling independent tuning of total RTP, base/feature contribution, hit frequency, and feature-trigger behavior.
- Implemented a settlement layer with atomic payout-event rounding, integer-cent wallet updates, market-specific absolute win caps, and audit-event generation to keep simulator, API, and wallet totals consistent.
- Built runtime math profile injection, profile validation, Monte Carlo RTP simulation, candidate profile search, profile verification, and artifact export tooling to support repeatable slot math optimization.
- Added deterministic regression tests for payout correctness, wild-limit enforcement, free-spin paytable routing, market-cap logic, and settlement semantics.

## Long Version

- Led the transformation of a TypeScript slot game prototype into a production-oriented slot math engine platform by redesigning the architecture around strict separation of concerns: engine execution, settlement, market rules, runtime math profiles, and simulation tooling.
- Corrected payout calculation defects by replacing a shortcut aggregation method with an exact dynamic-programming evaluator for 243-ways wins, preserving correct per-way multiplier capping and free-spin multiplier application without brute-force enumeration.
- Reworked the reel model from independent weighted cell sampling to deterministic reel strips with random stop positions and visible windows, bringing the implementation closer to real slot-math behavior and exposing the true frequency/RTP structure of the game.
- Extended `max_wilds_per_spin` enforcement across the full cascade lifecycle, ensuring the wild cap holds after refill events while preserving surviving wilds whenever possible.
- Designed and implemented a dedicated settlement layer that rounds only atomic payout events, sums in integer cents, applies per-spin and market-specific absolute caps, and emits audit events for capped outcomes.
- Added support for separate base and free-spin reel sets and paytables, giving the system enough mathematical flexibility to tune feature contribution independently of base-game value density.
- Built a runtime math profile system for in-memory paytable/reel-set overrides, enabling deterministic profile search and verification without mutating static source configuration.
- Created a simulation toolkit covering baseline RTP measurement, profile export, profile verification, and automated RTP/profile search with coarse, refine, and verify stages, plus persisted JSON artifacts for candidate review.
- Added deterministic unit tests covering payout invariants, free-spin paytable routing, market caps, runtime profile validation, and settlement correctness to make future tuning safe and repeatable.

## Resume Framing Options

### Option A: AI Game Engineering

- Built a production-oriented slot math platform with deterministic simulation, auditable settlement, runtime math profiles, and automated RTP optimization workflows.

### Option B: Game Backend / Systems

- Refactored a slot game prototype into a modular game math engine with exact payout evaluation, market-aware settlement, regression tests, and profile-driven tuning infrastructure.

### Option C: AI-Assisted Engineering

- Used AI-assisted systems engineering to transform a prototype slot implementation into a production-grade math and settlement platform with testing, search, and verification pipelines.

## Suggested Resume Section Title

- AI Game Engineering
- Game Math Platform
- Real-Money Game Systems
- Applied Simulation & Settlement Engineering
