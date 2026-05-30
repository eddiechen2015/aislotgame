# Operations

## Purpose

This document is the operational handbook for the project.

It is intended for engineers who need to:

- run the local server
- execute simulations
- search for RTP candidates
- verify profiles
- diagnose common failures

It is intentionally practical and command-oriented.

## Environment

The project requires:

- Node.js
- npm
- TypeScript toolchain from `package.json`

Install dependencies:

```bash
npm install
```

## Primary Commands

### Build

```bash
npm run build
```

Use this before any serious simulation or release handoff.

### Start the Local Test Server

```bash
npm run dev
```

The server starts on:

- `http://localhost:3000`

Available endpoints:

- `POST /api/login`
- `GET /api/me`
- `POST /api/spin`
- `GET /api/config`

### Run Unit Tests

```bash
npm run test:unit
```

This validates engine and settlement invariants.

### Standard RTP Simulation

```bash
npm run sim -- 200000 1 42 MGA
```

Arguments:

1. spins
2. bet
3. seed
4. market

If omitted:

- spins default to `1_000_000`
- bet defaults to `1.0`
- market defaults to `MGA`

To run a simulation against an approved profile artifact:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run sim -- 200000 1 42 MGA
```

The simulator prints the active profile id, version, and status before results.

### Export the Default Math Profile

```bash
npm run sim:export-profile
```

This writes:

- `artifacts/default.mathProfile.json`

### Verify a Specific Profile

```bash
npm run sim:verify -- artifacts/default.mathProfile.json 100000 42 MGA
```

Arguments:

1. profile path
2. spins
3. seed
4. market

### Verify a Profile Across Multiple Seeds

```bash
npm run sim:verify-batch -- artifacts/default.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/default.verifyBatch 4
```

Arguments:

1. profile path
2. spins per seed
3. comma-separated seeds
4. market
5. output prefix
6. worker count (optional; defaults to `SIM_VERIFY_WORKERS` or available CPU parallelism)

This writes:

- `artifacts/default.verifyBatch.json`
- `artifacts/default.verifyBatch.mathProfile.json`

The `.mathProfile.json` output includes verification metadata and is the input
for promotion.

### Promote a Verified Profile

```bash
npm run sim:promote-profile -- artifacts/default.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

Promotion fails if the profile has no batch verification metadata or if the
latest batch verification failed.

### Run With an Approved Profile

The server and simulator both support runtime profile loading:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

The server validates and installs the profile at startup. `/api/config` returns
the active `mathProfile` metadata plus the active base/free-spin paytables and
reel symbol counts.

For production-like runs, require an approved profile with passed verification
metadata:

```bash
REQUIRE_APPROVED_PROFILE=true MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

`NODE_ENV=production` also enables this approved-profile gate.

### Round Audit Logs

Each `/api/spin` emits a structured `[round-audit]` log event and appends the
same event to:

```text
artifacts/audit/round-audit.jsonl
```

Override the path with:

```bash
ROUND_AUDIT_PATH=artifacts/audit/local-rounds.jsonl npm run dev
```

The event includes:

- `roundId`
- market and bet cents
- balance before debit, after debit, and after credit
- active math profile id/version/status
- RNG trace summary and draw sequence
- raw engine win summary
- settled win summary
- absolute cap events, if any

Session tokens are logged as SHA-256 hashes, not plaintext tokens.

Absolute cap hits also emit `[absolute-win-cap]` events with the same `roundId`
so payout cap investigations can join the cap event back to the full round
audit event.

Verify a recorded round audit event:

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx
```

Pass the profile used by that round to replay the RNG trace and compare raw,
settled, cap, and wallet accounting fields:

```bash
npm run audit:verify -- artifacts/audit/round-audit.jsonl round_xxx artifacts/approved.mathProfile.json
```

### Search for Better RTP Profiles

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

Arguments:

1. coarse sample count
2. refine sample count
3. coarse spins
4. refine spins
5. market
6. seed
7. verify spins
8. worker count (optional; defaults to `SIM_SEARCH_WORKERS` or available CPU parallelism)

This writes:

- `artifacts/searchRtp.latest.json`
- `artifacts/searchRtp.bestCandidate.mathProfile.json`

The searcher samples base/FS paytables, scatter pays, and base/FS reel-count
deltas. It ranks candidates using normalized error against the active math
profile targets, compares candidates with common random numbers, uses adaptive
racing to spend more spins only on survivors, and rechecks finalists across
multiple deterministic seeds.

## Suggested Operating Modes

### Fast Local Development Loop

Use when iterating on engine logic:

```bash
npm run build
npm run test:unit
npm run sim -- 50000 1 42 MGA
```

### RTP Search Loop

Use when tuning math:

```bash
npm run sim:export-profile
npm run sim:search -- 80 50 5000 15000 MGA 42 30000
```

Then inspect:

- `artifacts/searchRtp.latest.json`

### Candidate Verification Loop

Use when a candidate looks promising:

```bash
npm run sim:verify-batch -- artifacts/searchRtp.bestCandidate.mathProfile.json 200000 42,99,123 MGA artifacts/candidate.verifyBatch
```

This is the preferred multi-seed pattern.

## Recommended Pre-Change Checklist

Before modifying math:

- export the current default profile
- record current baseline simulation results
- confirm unit tests are passing

Before modifying settlement:

- confirm unit tests cover the intended rule
- run server and simulator after the change
- verify wallet totals still match settled totals

Before modifying search logic:

- confirm runtime profile validation still passes
- run a small smoke test first
- only then run larger searches

## Recommended Pre-Release Checklist

Before treating a math profile as production-ready:

- `npm run build`
- `npm run test:unit`
- one medium/large `sim` run
- one explicit `sim:verify`
- multi-seed confirmation
- inspect `maxWinX`
- inspect `base/FS split`
- inspect `hitFreq`
- inspect `fsFreq`

## Common Failure Modes

### 1. Simulator RTP Does Not Match Wallet Expectations

Possible causes:

- raw engine values are being used instead of settled values
- rounding logic was bypassed
- market cap logic was bypassed

What to check:

- `settlement/settleSpin.ts`
- server wallet update path
- simulator path uses `settleSpinResult()`

### 2. Search Results Look Nonsensical

Possible causes:

- search dimensions are too wide
- too few spins per candidate
- scoring penalties are mis-weighted
- candidate profile is structurally invalid

What to do:

- reduce the search space
- increase spins
- inspect `artifacts/searchRtp.latest.json`
- run a smaller smoke test first

### 3. RTP Changes Drastically After a Small Config Edit

Possible causes:

- scatter visibility changed more than expected
- reel strip exposure changed, not just counts
- free-spin paytable and free-spin reel set are interacting nonlinearly

What to do:

- compare baseline and candidate profile exports
- verify free-spin frequency separately
- reduce the number of simultaneous parameter changes

### 4. Free-Spin Frequency Is Too High

Possible causes:

- scatter density is too high
- scatter clustering on strips is too favorable
- free-spin reel set is too generous if retriggers are active

What to inspect:

- base reel scatter counts
- free-spin reel scatter counts
- retrigger contribution in simulations

### 5. Hit Rate Is Too High

Possible causes:

- too many low-value base wins
- too many wild-assisted paths
- low-symbol density too high

What to inspect:

- base low-symbol paytable scale
- low-symbol reel counts
- wild density

## Reading Search Output

`artifacts/searchRtp.latest.json` contains:

- input search settings
- targets
- coarse top candidates
- refine top candidates
- verify top candidates
- best candidate summary

When judging results:

- verify top matters more than coarse top
- total RTP alone is not enough
- reject profiles that satisfy RTP but fail structure targets badly

## Operational Policy for Default Profile

Do not edit default math casually.

Recommended rule:

- default config should only change after candidate verification

That means:

1. search
2. verify
3. review
4. then promote

## Artifacts Policy

Recommended artifact handling:

- keep `default.mathProfile.json` as the current baseline snapshot
- keep `searchRtp.latest.json` as the latest search result
- archive important candidate profiles outside of `latest`

If the project grows, this should evolve into:

- timestamped candidate profiles
- seed-specific verification summaries
- release-tagged approved profiles

## Typical Commands by Role

### Engine Developer

```bash
npm run build
npm run test:unit
npm run sim -- 50000 1 42 MGA
```

### Math Designer

```bash
npm run sim:export-profile
npm run sim:search -- 120 80 5000 20000 MGA 42 50000
npm run sim:verify -- artifacts/default.mathProfile.json 200000 42 MGA
```

### QA / Integrator

```bash
npm run dev
npm run test:spin -- 5000 1.0 http://localhost:3000 qa-user
```

## Incident Response Guidance

If a major math regression is suspected:

1. stop changing search parameters
2. export current default profile
3. run unit tests
4. run one deterministic RTP verification with a known seed
5. compare against the previous archived profile

If a settlement regression is suspected:

1. verify `test:unit`
2. inspect atomic event rounding tests
3. inspect absolute cap handling
4. verify API returned totals match credited wallet totals

## Summary

This project should now be operated as a math platform, not as a one-off prototype.

That means:

- use profiles, not ad hoc edits
- use verification, not intuition alone
- use artifacts, not memory
- use tests before tuning

Following those rules is what keeps a slot engine maintainable once the math space becomes complex.
