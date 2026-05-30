# Math Workflow

## Purpose

This document describes how to evolve, test, search, verify, and promote slot math in this repository.

The core principle is:

- engine code should change rarely
- math profiles should change frequently

In practice, this means RTP tuning should happen through profiles and search tooling rather than manual edits to engine logic.

## Workflow Overview

The intended workflow is:

1. Start from the current default math profile
2. Export it as a JSON artifact
3. Run simulations to understand the baseline
4. Search for candidate profiles
5. Verify candidate profiles with longer and/or multiple seeds
6. Decide whether to promote a candidate
7. Write the approved math back into static config/profile

## The Three Kinds of Math State

There are three conceptual kinds of math configuration in this project:

1. Default static config
   Source of truth for the current engine build.

2. Runtime profile
   In-memory math config injected through `mathRuntime.ts`.

3. Candidate artifact
   JSON exported to `artifacts/` for comparison and verification.

Keeping those separate avoids accidental coupling between:

- approved math
- experimental math
- simulation-only math

## Core Concepts

### 1. Base vs Free-Spin Math

The engine supports:

- base reel set
- free-spin reel set
- base paytable
- free-spin paytable

This is critical because total RTP alone is not enough.
You typically need to shape:

- total RTP
- base RTP
- free-spin RTP
- hit frequency
- free-spin frequency

Trying to solve all of those using only one reel set or one paytable usually leads to unstable or contradictory tuning.

### 2. Raw Math vs Settled Math

All simulation and verification should use settled results, not raw engine results.

That means:

- round atomic payout events
- sum in cents
- apply market caps

Otherwise:

- simulator RTP
- API RTP
- credited wallet RTP

will diverge.

### 3. Profile Safety

Always use validated runtime profiles.

Invalid profiles can break assumptions about:

- reel lengths
- strip orders
- paytable positivity
- symbol counts

The validator exists specifically to reject these cases before simulations begin.

## Day-to-Day Math Process

### Step 1. Export the Current Default Profile

```bash
npm run sim:export-profile
```

This writes:

- `artifacts/default.mathProfile.json`

Use this as your baseline snapshot.

### Step 2. Measure the Current Baseline

Run a standard RTP simulation:

```bash
npm run sim -- 200000 1 42 MGA
```

To measure an approved or candidate artifact instead of the static default:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run sim -- 200000 1 42 MGA
```

Key outputs:

- `actual RTP`
- `base game RTP`
- `free spins RTP`
- `hit frequency`
- `free spin frequency`
- `max win`

Do not evaluate candidates without recording a baseline first.

### Step 3. Search for Candidate Profiles

Run the RTP searcher:

```bash
npm run sim:search -- 120 80 5000 20000 MGA 42 50000 4
```

Arguments are:

1. `coarseSamples`
2. `refineSamples`
3. `coarseSpins`
4. `refineSpins`
5. `market`
6. `seed`
7. `verifySpins`
8. `workerCount` (optional; defaults to `SIM_SEARCH_WORKERS` or available CPU parallelism)

The searcher:

- samples candidate profiles across base paytable, free-spin paytable, scatter pays, base reel counts, and free-spin reel counts
- scores candidates against `DEFAULT_MATH_PROFILE_TARGETS`, including total RTP, base/FS split, hit frequency, free-spin frequency, standard deviation, and max-win cap
- uses normalized target error: `abs(actual - target) / tolerance`
- uses common random numbers within each stage so candidates are compared on the same deterministic seed set
- uses adaptive racing, evaluating many candidates cheaply first and only spending larger budgets on survivors
- evaluates coarse candidates with one seed, refined candidates with two seeds, and verified finalists with five seeds
- can evaluate candidates in parallel with `worker_threads`
- records per-seed metrics plus aggregate metrics in `artifacts/searchRtp.latest.json`
- writes `artifacts/searchRtp.bestCandidate.mathProfile.json` for the current best candidate

### Step 4. Inspect Candidate Tradeoffs

Do not look only at RTP.

A good candidate must be judged across:

- total RTP
- base RTP
- free-spin RTP
- hit frequency
- free-spin frequency
- standard deviation
- max win

It is common to improve one metric while hurting another.

The search score helps rank candidates, but it does not replace multi-seed verification or human review.

### Step 5. Verify a Candidate Directly

Once you have a JSON profile candidate, verify it explicitly:

```bash
npm run sim:verify -- artifacts/default.mathProfile.json 100000 42 MGA
```

For real tuning work, use a candidate artifact rather than the default profile.

Use larger sample sizes before promotion.

### Step 6. Multi-Seed Verification

A single seed can be misleading, especially at moderate sample sizes.

Recommended practice:

- verify with at least 3 to 5 seeds
- compare variance between seeds
- reject candidates with unstable behavior

Run the batch verifier:

```bash
npm run sim:verify-batch -- artifacts/searchRtp.bestCandidate.mathProfile.json 100000 42,99,123,777,2026 MGA artifacts/candidate.verifyBatch
```

This writes:

- `artifacts/candidate.verifyBatch.json`
- `artifacts/candidate.verifyBatch.mathProfile.json`

The first file is the verification report. The second file is the same math
profile with verification metadata attached.

### Step 7. Promotion

Only after:

- the candidate survives larger samples
- the candidate survives multiple seeds
- its structure matches product intent

should it be promoted into static config/profile.

Promote a verified profile:

```bash
npm run sim:promote-profile -- artifacts/candidate.verifyBatch.mathProfile.json artifacts/approved.mathProfile.json
```

Promotion is intentionally strict:

- it requires verification metadata
- it refuses profiles whose latest batch verification failed
- it marks the output profile as `approved`

At that point, the approved artifact can be reviewed and then copied into the
static config/profile when a release build is prepared.

For runtime testing, the approved artifact can be loaded directly:

```bash
MATH_PROFILE_PATH=artifacts/approved.mathProfile.json npm run dev
```

The same environment variable works with `npm run sim`, so server smoke tests
and Monte Carlo validation can run against the exact same promoted profile.

and re-run:

- `npm run test:unit`
- `npm run sim`
- `npm run sim:verify`

## Search Space Design

The searcher currently tunes:

- base low paytable scale
- base premium paytable scale
- base scatter payout scale
- free-spin low paytable scale
- free-spin premium paytable scale
- base scatter density
- base wild density
- base premium density
- free-spin scatter density
- free-spin wild density
- free-spin premium density

This is already much stronger than a single RTP scale knob, but it is still not the full possible search space.

## When the Search Space Is Not Enough

If search repeatedly fails to satisfy all targets at once, do not immediately assume the searcher is broken.

Common reasons:

1. The game lacks enough math degrees of freedom

2. The targets are internally contradictory under current mechanics

3. The search ranges are too narrow or biased

4. The scoring function is penalizing the wrong things too strongly

The correct response depends on which case you observe.

## Interpreting Typical Failure Modes

### Case A. RTP is correct, but base/FS split is wrong

Usually means:

- free-spin reel set is not differentiated enough
- free-spin paytable is not differentiated enough

### Case B. Split is correct, but hit frequency is too high

Usually means:

- too many low-value base wins
- too much low-symbol density
- too many wild-assisted micro wins

### Case C. Free-spin RTP is too low, but trigger rate is high

Usually means:

- feature is triggering too often with too little average value
- reel set or free-spin paytable is too weak

### Case D. Free-spin RTP is high, but trigger rate is also high

Usually means:

- free-spin feature is too generous overall
- likely unsafe for volatility balance and operator exposure

### Case E. Search can satisfy total RTP only by breaking multiple structure targets

Usually means:

- you need more tuning dimensions
- or the game design intent needs revision

## Recommended Verification Ladder

Use a stepped approach instead of jumping directly to huge runs:

1. `5k` to `20k` spins
   Fast screening only

2. `50k` to `200k` spins
   Candidate ranking and local comparison

3. `500k` to `1M` spins
   Stronger confirmation

4. multi-seed long runs
   Final confidence before profile promotion

## What Should Be Versioned

Math work should preserve:

- candidate profile JSON
- simulation settings
- seed
- market
- score metrics
- promotion decision

At minimum, archive:

- the input profile
- the final verified profile
- the verification summaries

The `artifacts/` directory is the first step toward that.

## What Should Not Be Done

Avoid:

- editing engine code to fix RTP unless the behavior itself is wrong
- comparing raw engine results against wallet-level expectations
- promoting a candidate after only one short run
- mixing server API testing with RTP tuning
- tuning based only on visual inspection

## Current Maturity of the Math Workflow

The workflow is now strong enough to support serious iterative tuning:

- baseline export exists
- search exists
- verification exists
- profile injection exists
- config validation exists

What is still missing for a fully mature math pipeline is:

- formal profile promotion tooling
- multi-seed batch verification
- artifact history/versioning
- CI regression thresholds

## Suggested Next Improvements

If math work continues, the next useful additions are:

- `promoteProfile.ts`
- `verifyProfileBatch.ts`
- historical artifact comparison
- score breakdown reports
- profile naming/version metadata

## Summary

The engine is now built to support profile-driven math development.

The intended mindset should be:

- treat math as data
- treat tuning as a reproducible workflow
- treat static config as the result of verification, not the starting point of experimentation

That is the foundation required for a production-grade slot math process.
