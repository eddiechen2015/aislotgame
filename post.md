# Building a Slot Math Engineering Platform with AI as an Engineering Partner

I recently used AI as an engineering partner to take a TypeScript slot game prototype much closer to a production-oriented game engineering platform.

This was not a "generate a game in one prompt" experiment.

The valuable part was closer to real software engineering:

- reviewing the codebase
- finding hidden math and RTP bugs
- challenging weak assumptions
- refactoring architecture boundaries
- adding verification tooling
- turning one-off fixes into repeatable workflows

The starting point was a working 5x3, 243-ways cascading video slot with wild multipliers and free spins.

It spun. It paid. It had features.

But it also had the kinds of problems that often hide inside playable game prototypes:

- payout math that could break under per-way wild multiplier caps
- reel generation that behaved more like independent weighted picks than a real strip/window model
- simulator RTP and server settlement using different money semantics
- missing market-specific absolute win caps
- no clean boundary between raw game math and real-money-style settlement
- no safe workflow for testing alternative reel/paytable configurations
- no serious process for RTP search, profile verification, promotion, and runtime loading

The goal became more ambitious:

Build the slot as if it were a real math engine platform, not just a playable demo.

Important disclaimer: this is an engineering showcase, not a certified real-money gambling product. A real regulated launch would still require jurisdiction-specific certification for RNG, RTP, game rules, security, operational controls, and production deployment.

## What Changed

### 1. Exact 243-Ways Evaluation

The ways evaluator was rewritten so wild substitution and per-way multiplier capping are mathematically correct.

Instead of relying on shortcut aggregation that can overpay or underpay when many wild multiplier combinations exist, the evaluator now aggregates capped per-way multiplier products exactly.

That matters because a small mistake in ways aggregation directly changes RTP.

In a slot game, "almost right" math is not good enough.

### 2. Reel Strips Instead of Independent Cell Picks

The original reel model was closer to independent weighted symbol selection.

That is useful for early prototyping, but it does not reflect how a slot reel model is normally specified, simulated, or audited.

The engine now uses reel strips, stop positions, and visible windows, with separate base-game and free-spin reel sets.

This makes the math model closer to production expectations and gives RTP tooling a more realistic configuration surface.

### 3. Cascade Lifecycle Constraints

The project includes a `max_wilds_per_spin` exposure control.

One subtle bug was that this kind of constraint must apply across the full cascade lifecycle, not only to the initial grid.

The engine now enforces the wild cap after cascade refill as well, so later cascades cannot drift outside the intended exposure model.

### 4. A Dedicated Settlement Layer

The raw engine produces mathematical outcomes.

The server settlement layer determines what is actually paid.

That distinction became a major architectural boundary.

The settlement layer now handles:

- atomic payout-event rounding
- integer cents internally
- per-spin max-win enforcement
- market-specific absolute win caps
- auditable cap events

This fixed a common production risk: simulator RTP, API RTP, and wallet-credit RTP silently diverging because they use different precision or rounding semantics.

### 5. Market-Specific Absolute Win Caps

A slot may have a theoretical maximum win such as `10,000x bet`, but a specific operator or jurisdiction may also require an absolute currency cap.

The settlement model supports both:

```text
paidWin = min(calculatedWin, 10000x * bet, marketAbsoluteCap)
```

When an absolute cap is applied, the system emits structured audit events.

This is not just a payout rule. It is an operational and compliance traceability requirement.

### 6. Runtime Math Profiles

The game math was separated from engine logic through runtime math profiles.

A profile can define:

- base-game paytable
- free-spin paytable
- base-game reel symbol counts
- free-spin reel symbol counts
- reel strip orders
- scatter pays
- target RTP metadata
- verification metadata

This allows candidate math configurations to be simulated in memory without editing engine source code.

It also means a math profile can become a versioned artifact: searched, verified, promoted, loaded, and audited.

### 7. RTP Split as a First-Class Target

The project moved beyond "make total RTP close to 95% or 96%".

The tuning workflow now considers:

- total RTP
- base-game RTP
- free-spin RTP
- hit frequency
- free-spin trigger frequency
- volatility / standard deviation
- max-win exposure

Matching total RTP alone is relatively easy.

Matching total RTP plus base/free-spin split, hit frequency, free-spin frequency, volatility, market caps, and audit requirements is a much harder systems problem.

That is where slot math becomes engineering.

### 8. Automated RTP Search

I built an automated RTP search workflow that samples candidate math profiles.

The search space includes:

- per-symbol base paytable scales
- per-symbol free-spin paytable scales
- separate 3/4/5 scatter pay scales
- base-game reel count deltas
- free-spin reel count deltas

The scoring model uses profile targets directly:

```text
normalizedError = abs(actual - target) / tolerance
```

The search also uses common random numbers, adaptive racing, and optional worker-thread parallelism, so candidate comparisons are more stable and faster than naive one-shot Monte Carlo runs.

This turned RTP tuning from manual guessing into a reproducible engineering workflow.

### 9. Batch Verification with Statistical Confidence

Monte Carlo simulation always contains sampling error.

So the verification workflow was upgraded from simple pass/fail aggregate checks to a statistical report.

For each metric, the batch report includes:

- mean
- sample standard deviation
- standard error
- 95% confidence interval
- normalized target error
- whether the confidence interval stays inside tolerance

This prevents a profile from appearing to pass or fail just because the sample was too small.

### 10. Approved Profile Runtime Gate

The runtime loader now supports an approved-profile gate.

In production-like mode, the server refuses to load a math profile unless:

- `status = approved`
- verification metadata exists
- verification passed

This prevents accidentally deploying a candidate, rejected, or unverified profile.

It is a small guardrail, but a useful example of how math tooling becomes runtime safety.

### 11. True Audit Replay

Audit verification was upgraded from structural validation to actual replay.

Each spin audit event records the RNG trace. The verifier can reload the profile used by that round, replay the RNG calls, re-run the engine, settle the result, and compare:

- raw engine win
- scatter pay
- free-spin state
- settled cents
- cap events
- wallet debit/credit accounting
- full RNG trace consumption

A recorded round is no longer just a JSON object that looks valid.

It can be replayed and proven against the engine and math profile.

### 12. A Real Game Page

After the math and runtime layers were improved, I added a player-facing game page.

The page renders a 5x3 reel grid, consumes the server-authoritative `/api/spin` result, animates reel stops, highlights 243-ways wins, plays cascade removal/refill, shows free spins, and displays win/cap states.

The important boundary remains:

The client is a renderer, not a math engine.

All RNG, evaluation, settlement, caps, and wallet updates stay server-authoritative.

## What the Final System Looks Like

The project now has clear layers:

- `engine/` for raw slot math
- `settlement/` for real-money-style payout rules
- `server/` for HTTP APIs, sessions, wallet state, and audit logs
- `simulator/` for RTP simulation, search, verification, promotion, and audit replay
- `math profiles` for versioned, testable math configurations
- `public/game.html` for the animated player-facing game page

The result is not just "a slot game".

It is a production-oriented slot engineering platform with:

- deterministic slot math execution
- market-aware settlement
- runtime math profiles
- RTP search and verification
- statistical confidence reporting
- approved-profile runtime loading
- audit replay
- an animated playable client
- regression tests for critical math behavior

## Why AI Was Useful

The value of AI was not that it produced a lot of code quickly.

The value was that it helped operate like a tireless engineering reviewer:

- identify hidden RTP and payout bugs
- question vague math assumptions
- propose safer architecture boundaries
- turn bug fixes into reusable tools
- write verification scripts
- improve documentation after each engineering step
- keep pushing the project from prototype quality toward production-oriented engineering quality

The pattern that worked best was:

```text
AI is strongest when used as an engineering partner,
not as a code vending machine.
```

For game engineering, especially slot math, the hard question is rarely:

"Can the game spin?"

The harder questions are:

- Can the math be trusted?
- Can the RTP be reproduced?
- Can a profile be verified before runtime?
- Does server settlement match simulator assumptions?
- Can a production incident be audited and replayed?
- Does the client faithfully present server-authoritative outcomes?

That is the difference between a prototype and an engine.

## What Would Still Be Needed for a Regulated Launch

This project is an engineering showcase, not a completed regulated product.

Before any real-money launch, the next steps would include:

- replacing demo RNG with a compliance-grade CSPRNG or lab-approved RNG module
- jurisdiction-specific lab certification for RNG, RTP, scaling, and game rules
- formal math pack preparation
- production wallet and transaction persistence
- security review and penetration testing
- operational monitoring and change-control process
- responsible-gaming and jurisdiction-specific UX requirements

That distinction matters.

Good engineering is not a substitute for certification.

But good engineering makes certification and auditability much more realistic.

## Case Study Materials

The repository includes deeper write-ups on architecture, math workflow, operations, RTP search, and optimization history.

Replace the link below with the public GitHub repository when publishing:

```text
GitHub: <your-repository-url>
```

More detailed docs include:

- `improvements.md`
- `ARCHITECTURE.md`
- `MATH_WORKFLOW.md`
- `OPERATIONS.md`
- `SEARCH_RTP.md`
- `game.md`

This project became a practical example of how large language models can support serious game engineering:

not by skipping engineering discipline,

but by helping enforce it.
