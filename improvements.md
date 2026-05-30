# Improvements

## Overview

This document summarizes the full improvement journey of the **Asian Tour** slot engine, from initial code review to the final production-grade architecture.

It is written as a technical case study: what was wrong, why it mattered, how it was fixed, and what architectural patterns emerged during the process.

The goal is not to present a “perfect from day one” codebase. The goal is to show what a serious AI-assisted engineering pass looks like when applied to a non-trivial game math system.

---

## 1. Starting Point

The original codebase already had the skeleton of a modern slot engine:

- TypeScript math engine
- 243-ways evaluation
- cascades
- free spins
- wild multipliers
- an Express test server
- RTP simulation scripts

At first glance, the project looked complete.

However, once reviewed as a real-money slot engine rather than a prototype, several critical issues emerged:

- payout math did not match the written spec in important edge cases
- RTP and frequency targets were far from the intended values
- the engine, wallet, and simulation layers used inconsistent money semantics
- the reel model did not match the documented `per-reel strip` expectation
- the system had no real profile/search workflow for iterative math tuning

In other words, the system had a good shape, but not production-grade correctness yet.

---

## 2. Phase One: Core Math Audit

### Problem 1: Per-Way Multiplier Capping Was Wrong

The original evaluator used an aggregated shortcut to compute wild multiplier effects across ways.

That shortcut was mathematically valid only if:

- no per-way cap existed, and
- payouts remained linear after aggregation

But the spec explicitly required:

1. compute wild multiplier per way
2. cap that per-way multiplier
3. apply free-spin multiplier
4. sum all ways

This meant the old aggregation logic could both:

- underpay certain high-multiplier free-spin wins
- overpay certain mixed capped/uncapped way sets

### Fix

The evaluator was rewritten to use a DP-based exact aggregation model.

Instead of brute-forcing all 243 ways, the engine now:

- builds multiplier states reel by reel
- caps per-way wild multipliers during state propagation
- sums the exact capped outcome set

This preserved correctness while remaining computationally efficient.

### Why This Matters

In regulated game math, “almost equivalent” is not equivalent.
A single incorrect payout path invalidates certification confidence.

---

## 3. Phase Two: Wild Count Enforcement Across the Full Spin Lifecycle

### Problem 2: `max_wilds_per_spin` Only Applied to the Initial Grid

The engine originally enforced the wild limit only when generating the first grid.

After a cascade refill, new wilds could push the total wild count beyond the declared limit.

That violated the intended rule:

- the cap should apply to the entire spin, not only to the initial layout

### Fix

Wild-cap enforcement was extended to post-cascade refill states.

The implementation was careful not to mutate surviving wilds unnecessarily.

The new behavior:

- preserves existing non-removed wilds when possible
- demotes newly generated refill wilds first
- only demotes older wilds if the grid is still above cap

### Why This Matters

This change preserved both:

- compliance with the math rule
- the gameplay expectation that persistent helpers should remain stable unless truly necessary to demote

---

## 4. Phase Three: Settlement Semantics and Wallet Consistency

### Problem 3: The Engine, Wallet, and Reporting Layers Used Different Money Semantics

Originally:

- the engine produced floating-point results
- the wallet rounded balances per request
- API payloads exposed unrounded totals
- simulator RTP measured raw math instead of credited value

This created a serious production problem:

- mathematical RTP
- visible RTP
- actually credited RTP

could all diverge.

### Fix

A dedicated money and settlement layer was introduced.

Key decisions:

- balances are stored in integer cents
- the wallet uses integer arithmetic only
- simulation uses settled results, not raw engine totals
- atomic payout events are rounded individually
- aggregate totals are summed in cents, not repeatedly rounded

### Why This Matters

This is a classic production-grade distinction:

- **engine output** is not the same as **wallet outcome**

By separating them, the project became safe for:

- deterministic math validation
- real-money balance updates
- auditability
- consistent RTP reporting

---

## 5. Phase Four: Market-Specific Absolute Win Caps

### Problem 4: Only Multiplier Caps Existed, Not Market Absolute Caps

The engine enforced a `10000x bet` style per-spin cap, but did not implement market-specific absolute payout caps.

That is not enough in a real-money environment.

At high bets, `10000x bet` can exceed market or operator payout limits.

### Fix

A market-aware absolute cap layer was added:

- cap by multiplier
- cap by market maximum
- use `min(multiplier_cap, market_cap)`
- generate audit events when the absolute cap is hit

This was implemented in settlement rather than raw engine math, because it depends on the player’s market.

### Why This Matters

This is the kind of requirement that separates a math demo from a deployable regulated engine.

---

## 6. Phase Five: Moving from Independent Weighted Cells to Reel Strips

### Problem 5: The Reel Model Did Not Match the Intended Math Model

The original system effectively picked each visible symbol independently using weights.

But the documentation and intended design assumed:

- reel strips
- stop positions
- visible windows

Those are not equivalent.

Scatter visibility, premium clustering, and overall symbol exposure depend on strip adjacency, not just weights.

### Fix

The engine was refactored to use:

- deterministic reel strips
- random stop positions
- visible windows

This made the model closer to the kind of structure expected in actual slot math design.

### Important Outcome

The immediate result was surprising but useful:

- RTP actually dropped when the correct strip model was introduced

That was not a regression.
It was a sign that the earlier higher return assumptions were partly artifacts of the wrong reel model.

This is exactly why structural correctness must come before tuning.

---

## 7. Phase Six: Runtime Math Profiles

### Problem 6: The Engine Was Hard-Wired to Static Config

Even after the reel model and evaluator were improved, the project still lacked a clean way to run alternative math configurations in memory.

Without that, serious RTP tuning becomes clumsy:

- edit `config.ts`
- rerun simulation
- manually compare results
- repeat

That is not scalable.

### Fix

A runtime math profile system was added.

The engine can now execute using injected profiles that include:

- base paytable
- free-spin paytable
- base reel set
- free-spin reel set
- base scatter payouts

Profile overrides are scoped and reversible.

This enabled:

- safe simulations
- candidate profile testing
- future promotion workflows

### Why This Matters

This changed the project from:

- a single hard-coded game

to:

- a reusable slot math platform

---

## 8. Phase Seven: Free-Spin Reel Sets and Free-Spin Paytables

### Problem 7: Total RTP Could Move, But Feature Structure Could Not

Once search tooling was introduced, it became clear that total RTP alone was easy to move.

The hard part was jointly matching:

- total RTP
- base RTP
- free-spin RTP
- hit frequency
- free-spin trigger frequency

With only:

- one reel set
- one paytable

the system lacked enough degrees of freedom.

### Fix 1: Dedicated Free-Spin Reel Set

A separate free-spin reel set was introduced.

This allowed the engine to distinguish between:

- base reel exposure
- feature reel exposure

### Fix 2: Dedicated Free-Spin Paytable

A separate free-spin paytable was then introduced.

This was the major breakthrough.

It allowed the system to independently control:

- base value density
- feature value density

without forcing both phases of the game to move together.

### Why This Matters

This is where the project began acting like a real production slot engine:

- base math and feature math were no longer artificially tied together

That separation is essential if a slot is expected to meet both total RTP and feature-structure targets.

---

## 9. Phase Eight: Automated RTP Search

### Problem 8: Manual Tuning Was No Longer Practical

After reel strips, base/FS split, settlement semantics, and market caps were all made explicit, manual tuning was no longer realistic.

The interaction surface had become too large.

### Fix

An automated RTP/profile search script was introduced.

It supports:

- coarse search
- local refinement
- final verification
- candidate artifact export

The search space evolved over time to include:

- base low-symbol paytable scaling
- base premium paytable scaling
- base scatter payout scaling
- base reel count adjustments
- free-spin low-symbol paytable scaling
- free-spin premium paytable scaling
- free-spin reel count adjustments

### Important Result

The search process also revealed an important design truth:

- some target combinations were impossible or very unstable under the current mechanic set

That is not a failure of the searcher.
That is the searcher doing its job by exposing structural limits.

---

## 10. Phase Nine: Verification and Promotion Workflow

### Problem 9: Search Without Verification Is Not a Real Workflow

A search script is useful, but not sufficient.

Without profile export and verification tools, candidate profiles are hard to compare, share, or promote.

### Fix

The following tooling was added:

- export default profile
- verify arbitrary profile JSON
- write latest search results to `artifacts/`
- keep math config validation on every runtime override

This formalized a production-style flow:

1. export current baseline
2. search candidates
3. verify candidates
4. decide whether to promote

### Why This Matters

This is where the project stopped being a prototype and became an operational math system.

---

## 11. Phase Ten: Test Coverage for Math Invariants

### Problem 10: Tuning Was Outpacing Safety

As math flexibility increased, so did regression risk.

Without tests, each tuning or settlement change risked silently breaking:

- per-way cap behavior
- free-spin paytable routing
- wild-limit enforcement
- market caps
- rounding semantics
- runtime override rollback

### Fix

A deterministic unit test suite was added to cover those invariants.

This means future math tuning can proceed with guardrails.

### Why This Matters

A production-grade game engine is not just about flexible math.
It is about being able to change math without breaking fundamental rules.

---

## 12. What the Final System Achieved

By the end of the optimization process, the project had evolved into:

- a deterministic math engine
- a real-money settlement system
- a market-cap-aware payout pipeline
- a runtime math-profile execution layer
- a reel-set and paytable split between base and free spins
- a searchable RTP/profile tuning workflow
- a verification and artifact workflow
- a regression-tested engine core

From an engineering perspective, that is the key transition:

- from “playable prototype”
- to “production-grade slot math platform”

---

## 13. What Was Not Hidden

One of the most important aspects of this process is that not every problem was “magically solved by code”.

Several search passes showed that:

- matching total RTP is easy
- matching total RTP plus structure is hard
- some target combinations require more mechanical freedom, not just more brute-force searching

This is important because strong engineering is not just about implementing fixes.
It is also about correctly identifying when the current system design itself limits what is achievable.

---

## 14. Key Lessons

### 1. Correctness Before Tuning

RTP tuning is meaningless if:

- the evaluator is wrong
- the reel model is wrong
- settlement semantics are inconsistent

### 2. Raw Math and Credited Math Must Be Separate

A production engine must distinguish:

- raw spin result
- settled player result

### 3. Feature Math Needs Its Own Degrees of Freedom

If free spins are supposed to carry a different RTP share and volatility profile, they need their own:

- reel set
- paytable

### 4. Search Tooling Must Be First-Class

Once the math model becomes expressive, profile search and verification are no longer optional conveniences.
They become core infrastructure.

### 5. Tests Matter More As Flexibility Increases

The more tunable the engine becomes, the more dangerous untested changes become.

---

## 15. Final Assessment

At the beginning, the project looked like a good slot prototype.

By the end of the work, it had become something significantly stronger:

- not just a slot implementation
- but a maintainable, auditable, tunable slot engine platform

This is the kind of transformation that demonstrates what AI-assisted game programming can do when used as a systematic engineering partner rather than as a code generator.
