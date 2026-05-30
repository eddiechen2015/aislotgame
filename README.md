# Asian Tour Slot Engine

A production-oriented TypeScript slot math platform for a 5x3, 243-ways cascading slot with wild multipliers, free spins, market-aware payout caps, deterministic simulation, and profile-driven RTP optimization.

This repository is not only a playable slot prototype. It is a full engineering platform for:

- deterministic game math execution
- real-money-style settlement
- RTP and feature-profile validation
- runtime math profile injection
- automated profile search and verification
- API and browser-based testing

## Highlights

- Exact 243-ways evaluator with per-way wild multiplier capping
- Separate base-game and free-spin reel sets
- Separate base-game and free-spin paytables
- Cascade engine with post-refill wild-cap enforcement
- Atomic event rounding in settlement
- Market-specific absolute win caps with audit logging
- Runtime math profiles for safe in-memory tuning
- Approved-profile runtime gate for production-like startup safety
- Monte Carlo RTP simulator, profile search, profile export, profile promotion, and profile verification tools
- Multi-seed verification with statistical confidence reporting
- RNG-trace audit replay for recorded round verification
- Deterministic unit tests for core math invariants

## Why This Project Exists

Most slot prototypes stop at “the game spins”.

This project goes further by treating slot math as a production systems problem:

- raw engine math is separated from wallet settlement
- feature math can be tuned independently from base-game math
- profile changes can be simulated without editing source files
- math experiments can be exported, verified, and compared
- production-like runtime loading can reject unapproved or unverified profiles
- recorded rounds can be replayed against the engine and math profile

The result is a reusable slot-engine platform rather than a one-off demo.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the local test server:

```bash
npm run dev
```

Run the server with an approved math profile artifact:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

For production-like startup, require the loaded profile to be `approved` and to
carry passed verification metadata:

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

Then open:

- [http://localhost:3000](http://localhost:3000)

## Core Commands

Build the project:

```bash
npm run build
```

Run unit tests:

```bash
npm run test:unit
```

Run a standard RTP simulation:

```bash
npm run sim -- 200000 1 42 MGA
```

Run the simulator with an approved math profile artifact:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run sim -- 200000 1 42 MGA
```

Export the current default math profile:

```bash
npm run sim:export-profile
```

Verify a profile:

```bash
npm run sim:verify -- artifacts/default.mathProfile.json 100000 42 MGA
```

Verify a profile across multiple seeds:

```bash
npm run sim:verify-batch -- artifacts/default.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/default.verifyBatch 4
```

The batch report includes aggregate metrics, per-seed metrics, standard error,
95% confidence intervals, and normalized target error for each profile target.

Promote a verified profile:

```bash
npm run sim:promote-profile -- artifacts/default.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

Search for improved RTP/math candidates:

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

`sim:search` samples base/FS paytables, scatter pays, and base/FS reel-count
deltas, then scores candidates with normalized error against the math profile
targets across total RTP, base/FS split, hit frequency, FS frequency, volatility,
and max-win exposure. It uses common random numbers, adaptive racing, and
optional worker-thread parallelism.

It writes both:

- `artifacts/searchRtp.latest.json`
- `artifacts/searchRtp.bestCandidate.mathProfile.json`

Run end-to-end HTTP spin testing:

```bash
npm run test:spin -- 5000 1.0 http://localhost:3000 test-user
```

Verify a recorded round audit event:

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx
```

Pass the profile path as the third argument to replay the recorded RNG trace:

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx artifacts/approved.mathProfile.json
```

## Repository Structure

```text
src/
  engine/         Raw slot math engine
  settlement/     Real-money settlement rules and cap handling
  server/         Express test server, sessions, wallet, audit
  simulator/      RTP simulation, search, export, verification
  tests/          Deterministic unit tests
public/
  index.html      Browser test harness
artifacts/
  *.json          Exported profiles and search reports
```

## Architecture Summary

The system is built in layers:

1. `engine/`
   Produces raw spin outcomes, cascades, scatter triggers, and free-spin sessions.

2. `settlement/`
   Converts raw outcomes into settled money values using atomic event rounding, per-spin caps, and market-specific absolute caps.

3. `server/`
   Exposes APIs, manages sessions and balances, and logs audit events.

4. `simulator/`
   Runs Monte Carlo verification, candidate-profile search, profile promotion, and audit replay workflows.

5. `tests/`
   Protects payout correctness, settlement semantics, cap behavior, runtime profile safety, and audit replay behavior.

## Math Profile Workflow

The engine supports runtime-injected math profiles.

That means you can:

- keep the approved default profile in static config
- run candidate reel/paytable profiles entirely in memory
- verify profiles independently before promotion
- require approved and verified profiles before production-like runtime loading

This makes the project suitable for iterative slot-math tuning instead of manual config editing only.

## Audit and Replay

Every server spin can emit a structured round audit event containing:

- active math profile metadata
- RNG trace
- raw engine result summary
- settled money result summary
- balance debit/credit fields
- absolute cap events

`audit:verify` can run in two modes:

- structural mode, when only the audit file and round id are provided
- replay mode, when the matching math profile path is also provided

Replay mode replays the recorded RNG trace through the engine, settles the
result again, and compares raw output, settled output, cap events, and wallet
accounting fields.

## API Overview

The test server exposes:

- `POST /api/login`
- `GET /api/me`
- `POST /api/spin`
- `GET /api/config`

`/api/login` accepts an optional market so the settlement layer can apply market-specific absolute win caps.

## Documentation

Detailed documentation is available in:

- [README.zh-CN.md](./README.zh-CN.md)
- [README.en.md](./README.en.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [MATH_WORKFLOW.md](./MATH_WORKFLOW.md)
- [OPERATIONS.md](./OPERATIONS.md)
- [SEARCH_RTP.md](./SEARCH_RTP.md)
- [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)
- [improvements.md](./improvements.md)
- [improvements-visual.md](./improvements-visual.md)
- [portfolio-summary.md](./portfolio-summary.md)

## Current Status

The engine architecture is close to production-grade:

- deterministic and testable
- settlement-safe
- market-cap aware
- profile-search capable
- approved-profile gated
- audit-replay capable
- statistical verification capable
- regression-tested

The default math profile is still under active tuning.

That distinction is intentional:

- the platform itself is engineered for production workflows
- the final approved game math can continue to evolve on top of it

## Best Use Cases

This repository is a strong fit for:

- slot math R&D
- AI-assisted game engineering showcases
- simulation-heavy backend engineering
- correctness-critical payout systems
- profile-driven tuning workflows

## License / Notes

This repository currently acts as an engineering and math platform example.  
If you plan to use it in a regulated or real-money environment, you should still perform:

- independent math review
- long-run multi-seed RTP verification
- certified RNG integration
- security hardening
- persistent wallet/session storage integration
- certification-specific compliance work
