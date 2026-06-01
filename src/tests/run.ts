import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { applyCascade } from "../engine/cascade";
import { SYMBOLS } from "../engine/config";
import { buildDefaultMathProfileDocument, buildDefaultRuntimeMathConfig, normalizeMathProfileDocument } from "../engine/mathProfile";
import { getActiveMathProfileMetadata, loadAndInstallMathProfile, loadMathProfileFromEnv } from "../engine/mathProfileLoader";
import { RuntimeMathConfig, getRuntimeMathConfig, resetRuntimeMathConfig, setRuntimeMathConfig } from "../engine/mathRuntime";
import { mulberry32 } from "../engine/rng";
import { generateGrid } from "../engine/reel";
import { validateRuntimeMathConfig } from "../engine/validateMathConfig";
import { evaluateWays } from "../engine/waysEvaluator";
import { Market } from "../gameMarkets";
import { settleSpinResultDetailed } from "../settlement/settleSpin";
import { SpinResult, playRound } from "../engine/spinEngine";
import { buildRoundAuditEvent, hashToken, writeRoundAuditJsonl } from "../server/audit";
import { createAuditedRng } from "../server/auditRng";
import { buildInternalConfigResponse } from "../server/configResponse";
import { amountToCents } from "../server/money";
import { createRoundId } from "../server/roundId";
import { loadAuditEvents, verifyRoundAuditEvent } from "../simulator/auditVerify";

function approxEqual(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`);
}

function testPerWayCapWithSpinMultiplier(): void {
  const grid = [
    [{ symbol: "WILD", multiplier: 5 }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "WILD", multiplier: 5 }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "WILD", multiplier: 5 }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
  ];
  const result = evaluateWays(grid as any, 1, 10);
  const win = result.wins.find((entry) => entry.symbol === "A");
  assert.ok(win);
  approxEqual(win.waysMultiplierProduct, 100);
  approxEqual(win.amount, SYMBOLS.A.pays![5] * 100 / 243 * 10);
}

function testPerWayCapMixedWays(): void {
  const grid = [
    [{ symbol: "A" }, { symbol: "WILD", multiplier: 5 }, { symbol: "K" }],
    [{ symbol: "A" }, { symbol: "WILD", multiplier: 5 }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "WILD", multiplier: 5 }, { symbol: "J" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "J" }, { symbol: "10" }],
  ];
  const result = evaluateWays(grid as any, 1, 1);
  const win = result.wins.find((entry) => entry.symbol === "A");
  assert.ok(win);
  assert.equal(win.waysCount, 8);
  approxEqual(win.waysMultiplierProduct, 191);
  approxEqual(win.baseAmount, SYMBOLS.A.pays![5] * 191 / 243);
}

function testFreeSpinPaytableOverride(): void {
  const original = getRuntimeMathConfig();
  const override: RuntimeMathConfig = {
    ...original,
    baseSymbols: {
      ...original.baseSymbols,
      A: { ...original.baseSymbols.A, pays: { 3: 1, 4: 1, 5: 1 } },
    },
    freeSpinSymbols: {
      ...original.freeSpinSymbols,
      A: { ...original.freeSpinSymbols.A, pays: { 3: 10, 4: 10, 5: 10 } },
    },
  };

  setRuntimeMathConfig(override);
  const grid = [
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
    [{ symbol: "A" }, { symbol: "K" }, { symbol: "Q" }],
  ];
  const base = evaluateWays(grid as any, 1, 1, "base");
  const fs = evaluateWays(grid as any, 1, 1, "free_spins");
  approxEqual(base.wins.find((entry) => entry.symbol === "A")!.baseAmount, 1 / 243);
  approxEqual(fs.wins.find((entry) => entry.symbol === "A")!.baseAmount, 10 / 243);
  resetRuntimeMathConfig();
}

function testMaxWildsAcrossCascade(): void {
  const grid = [
    [{ symbol: "WILD", multiplier: 2 }, { symbol: "WILD", multiplier: 2 }, { symbol: "A" }],
    [{ symbol: "WILD", multiplier: 2 }, { symbol: "A" }, { symbol: "A" }],
    [{ symbol: "WILD", multiplier: 2 }, { symbol: "A" }, { symbol: "A" }],
    [{ symbol: "WILD", multiplier: 2 }, { symbol: "A" }, { symbol: "A" }],
    [{ symbol: "A" }, { symbol: "A" }, { symbol: "A" }],
  ];
  const rng = {
    next() { return 0; },
    nextInt() { return 0; },
    pickWeighted(weights: number[]) { return weights.length - 2; },
  };
  const next = applyCascade(grid as any, [{ reel: 4, row: 2 }], rng as any);
  const wildCount = next.flat().filter((cell) => cell.symbol === "WILD").length;
  assert.equal(wildCount, 5);
}

function fakeSpinResult(scatterPay: number): SpinResult {
  return {
    bet: 100,
    capped: false,
    totalWin: scatterPay,
    base: {
      initialGrid: [] as any,
      cascades: [],
      cascadeWin: 0,
      scatterCount: 5,
      scatterPay,
      freeSpinsTriggered: false,
      capped: false,
    },
  };
}

function testAbsoluteCapByMarket(): void {
  const mga = settleSpinResultDetailed(fakeSpinResult(1_000_000), "MGA" as Market);
  const curacao = settleSpinResultDetailed(fakeSpinResult(1_000_000), "Curacao" as Market);
  assert.equal(mga.settled.totalWin, 500_000);
  assert.equal(mga.absoluteCapped, true);
  assert.equal(curacao.settled.totalWin, 1_000_000);
  assert.equal(curacao.absoluteCapped, false);
}

function testAtomicEventRounding(): void {
  const result: SpinResult = {
    bet: 1,
    capped: false,
    totalWin: 0.018,
    base: {
      initialGrid: [] as any,
      cascades: [{
        index: 0,
        gridBefore: [] as any,
        wins: [
          { symbol: "A", matchCount: 3, symbolPay: 0.5, waysCount: 1, waysMultiplierProduct: 1, baseAmount: 0.006, amount: 0.006 },
          { symbol: "K", matchCount: 3, symbolPay: 0.6, waysCount: 1, waysMultiplierProduct: 1, baseAmount: 0.006, amount: 0.006 },
        ],
        cascadeWin: 0.012,
        removedPositions: [],
        gridAfter: [] as any,
      }],
      cascadeWin: 0.012,
      scatterCount: 3,
      scatterPay: 0.006,
      freeSpinsTriggered: false,
      capped: false,
    },
  };
  const settled = settleSpinResultDetailed(result, "MGA").settled;
  assert.equal(settled.base.cascadeWin, 0.02);
  assert.equal(settled.base.scatterPay, 0.01);
  assert.equal(settled.totalWin, 0.03);
}

function testRuntimeOverrideResetAndCache(): void {
  const original = buildDefaultRuntimeMathConfig();
  const override: RuntimeMathConfig = {
    ...original,
    baseReelSymbolCounts: Array.from({ length: 5 }, () => ({
      A: 3, K: 0, Q: 0, J: 0, "10": 0,
      NINJA: 0, DRAGON: 0, PHOENIX: 0, SHOGUN: 0,
      WILD: 0, SCATTER: 0,
    })),
    baseReelStripOrders: Array.from({ length: 5 }, () => ["A"]),
    freeSpinReelSymbolCounts: Array.from({ length: 5 }, () => ({
      A: 3, K: 0, Q: 0, J: 0, "10": 0,
      NINJA: 0, DRAGON: 0, PHOENIX: 0, SHOGUN: 0,
      WILD: 0, SCATTER: 0,
    })),
    freeSpinReelStripOrders: Array.from({ length: 5 }, () => ["A"]),
  };
  const rng = { next: () => 0, nextInt: () => 0, pickWeighted: () => 0 };

  setRuntimeMathConfig(override);
  const overriddenGrid = generateGrid(rng as any);
  assert.ok(overriddenGrid.flat().every((cell) => cell.symbol === "A"));
  const overriddenFsGrid = generateGrid(rng as any, "free_spins");
  assert.ok(overriddenFsGrid.flat().every((cell) => cell.symbol === "A"));

  resetRuntimeMathConfig();
  const resetGrid = generateGrid(rng as any);
  assert.notDeepEqual(resetGrid.map((col) => col.map((cell) => cell.symbol)), overriddenGrid.map((col) => col.map((cell) => cell.symbol)));
}

function testInvalidMathConfigRejected(): void {
  const original = buildDefaultRuntimeMathConfig();
  const invalidShape: RuntimeMathConfig = {
    ...structuredClone(original),
    baseReelStripOrders: [],
  };
  assert.throws(() => validateRuntimeMathConfig(invalidShape));

  const missingPositiveCountSymbol = structuredClone(original);
  missingPositiveCountSymbol.baseReelStripOrders[0] = missingPositiveCountSymbol.baseReelStripOrders[0]
    .filter((symbol) => symbol !== "DRAGON");
  assert.throws(
    () => validateRuntimeMathConfig(missingPositiveCountSymbol),
    /must contain DRAGON/,
  );

  const invalidPayable = structuredClone(original);
  invalidPayable.payableSymbols = [...invalidPayable.payableSymbols, "SCATTER"];
  assert.throws(
    () => validateRuntimeMathConfig(invalidPayable),
    /payableSymbols cannot include SCATTER/,
  );

  const invalidScatter = structuredClone(original);
  invalidScatter.baseScatterPayoutXBet[3] = Number.NaN;
  assert.throws(
    () => validateRuntimeMathConfig(invalidScatter),
    /baseScatterPayoutXBet\.3/,
  );
}

function testRuntimeMathConfigIsImmutableAfterInstall(): void {
  const override = buildDefaultRuntimeMathConfig();
  override.baseSymbols.A = { ...override.baseSymbols.A, pays: { 3: 123, 4: 123, 5: 123 } };

  setRuntimeMathConfig(override);
  override.baseSymbols.A.pays![3] = 456;
  assert.equal(getRuntimeMathConfig().baseSymbols.A.pays![3], 123);
  assert.ok(Object.isFrozen(getRuntimeMathConfig()));
  assert.ok(Object.isFrozen(getRuntimeMathConfig().baseSymbols.A.pays));
  assert.throws(
    () => {
      getRuntimeMathConfig().baseSymbols.A.pays![3] = 789;
    },
    /read only|Cannot assign/,
  );
  resetRuntimeMathConfig();
}

function testMathProfileDocumentNormalization(): void {
  const raw = buildDefaultRuntimeMathConfig();
  const wrapped = normalizeMathProfileDocument(raw, { profileId: "test-raw-profile" });
  assert.equal(wrapped.metadata.profileId, "test-raw-profile");
  assert.equal(wrapped.metadata.status, "candidate");
  assert.deepEqual(wrapped.config.payableSymbols, raw.payableSymbols);

  const document = buildDefaultMathProfileDocument();
  const normalized = normalizeMathProfileDocument(document, { status: "verified" });
  assert.equal(normalized.metadata.profileId, document.metadata.profileId);
  assert.equal(normalized.metadata.status, "verified");
  assert.equal(normalized.config.baseReelSymbolCounts.length, 5);
}

function testMathProfileRuntimeLoad(): void {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "math-profile-"));
  try {
    const profile = buildDefaultMathProfileDocument();
    profile.metadata.profileId = "test-approved-profile";
    profile.metadata.profileVersion = "test-1";
    profile.metadata.status = "approved";
    profile.config.baseSymbols.A = { ...profile.config.baseSymbols.A, pays: { 3: 123, 4: 123, 5: 123 } };

    const profilePath = path.join(tmpDir, "approved.mathProfile.json");
    writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    loadAndInstallMathProfile(profilePath);

    assert.equal(getActiveMathProfileMetadata().profileId, "test-approved-profile");
    assert.equal(getRuntimeMathConfig().baseSymbols.A.pays![3], 123);
    const configResponse = buildInternalConfigResponse();
    assert.equal(configResponse.mathProfile.profileId, "test-approved-profile");
    assert.equal(configResponse.paytable.find((entry) => entry.id === "A")!.pays![3], 123);

    loadMathProfileFromEnv({});
    assert.equal(getActiveMathProfileMetadata().profileId, "asian-tour-default");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testApprovedProfileRuntimeGate(): void {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "math-profile-gate-"));
  try {
    const candidate = buildDefaultMathProfileDocument();
    candidate.metadata.profileId = "test-candidate-profile";
    candidate.metadata.status = "candidate";
    const candidatePath = path.join(tmpDir, "candidate.mathProfile.json");
    writeFileSync(candidatePath, JSON.stringify(candidate, null, 2));

    assert.throws(
      () => loadAndInstallMathProfile(candidatePath, { requireApproved: true }),
      /must be approved/,
    );

    const approvedWithoutVerification = buildDefaultMathProfileDocument();
    approvedWithoutVerification.metadata.profileId = "test-approved-no-verification";
    approvedWithoutVerification.metadata.status = "approved";
    const approvedWithoutVerificationPath = path.join(tmpDir, "approved-no-verification.mathProfile.json");
    writeFileSync(approvedWithoutVerificationPath, JSON.stringify(approvedWithoutVerification, null, 2));

    assert.throws(
      () => loadAndInstallMathProfile(approvedWithoutVerificationPath, { requireApproved: true }),
      /passed verification/,
    );

    const approved = buildDefaultMathProfileDocument();
    approved.metadata.profileId = "test-approved-profile";
    approved.metadata.status = "approved";
    approved.metadata.verification = {
      passed: true,
      verifiedAt: new Date(0).toISOString(),
      market: "MGA",
      spinsPerSeed: 1,
      seeds: [42],
      aggregate: {
        rtp: 0,
        baseRtp: 0,
        fsRtp: 0,
        hitFreq: 0,
        fsFreq: 0,
        stdDevX: 0,
        maxWinX: 0,
      },
      failures: [],
    };
    const approvedPath = path.join(tmpDir, "approved.mathProfile.json");
    writeFileSync(approvedPath, JSON.stringify(approved, null, 2));

    loadAndInstallMathProfile(approvedPath, { requireApproved: true });
    assert.equal(getActiveMathProfileMetadata().profileId, "test-approved-profile");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    loadMathProfileFromEnv({});
  }
}

function testAuditedRngTrace(): void {
  const base = {
    next: () => 0.25,
    nextInt: (n: number) => n - 1,
    pickWeighted: (_weights: number[]) => 1,
  };
  const audited = createAuditedRng(base);
  assert.equal(audited.rng.next(), 0.25);
  assert.equal(audited.rng.nextInt(7), 6);
  assert.equal(audited.rng.pickWeighted([2, 3, 5]), 1);
  assert.deepEqual(audited.trace, [
    { index: 0, method: "next", value: 0.25 },
    { index: 1, method: "nextInt", n: 7, value: 6 },
    { index: 2, method: "pickWeighted", totalWeight: 10, weightCount: 3, value: 1 },
  ]);
}

async function testRoundAuditEvent(): Promise<void> {
  const roundId = createRoundId();
  assert.ok(roundId.startsWith("round_"));

  const raw = fakeSpinResult(12.34);
  const settled = settleSpinResultDetailed(raw, "MGA");
  const profile = buildDefaultMathProfileDocument();
  const event = buildRoundAuditEvent({
    roundId,
    username: "audit-user",
    token: "plain-token",
    market: "MGA",
    betCents: amountToCents(100),
    balanceBeforeCents: amountToCents(1000),
    balanceAfterDebitCents: amountToCents(900),
    balanceAfterCreditCents: amountToCents(912.34),
    mathProfile: profile.metadata,
    rngTrace: [{ index: 0, method: "nextInt", n: 10, value: 3 }],
    rawResult: raw,
    settled,
  });

  assert.equal(event.roundId, roundId);
  assert.equal(event.tokenHash, hashToken("plain-token"));
  assert.notEqual(event.tokenHash, "plain-token");
  assert.equal(event.rng.traceCount, 1);
  assert.equal(event.settled.totalWinCents, 1234);
  assert.equal(event.mathProfile.profileId, "asian-tour-default");
  const verified = await verifyRoundAuditEvent(event);
  assert.equal(verified.passed, true);
}

async function testRoundAuditReplay(): Promise<void> {
  const roundId = createRoundId();
  const profile = buildDefaultMathProfileDocument();
  const audited = createAuditedRng(mulberry32(123));
  const raw = playRound(1, audited.rng);
  const settled = settleSpinResultDetailed(raw, "MGA");
  const event = buildRoundAuditEvent({
    roundId,
    username: "audit-replay-user",
    token: "plain-token",
    market: "MGA",
    betCents: amountToCents(1),
    balanceBeforeCents: amountToCents(1000),
    balanceAfterDebitCents: amountToCents(999),
    balanceAfterCreditCents: amountToCents(999 + settled.settled.totalWin),
    mathProfile: profile.metadata,
    rngTrace: audited.trace,
    rawResult: raw,
    settled,
  });

  const verified = await verifyRoundAuditEvent(event, profile.config);
  assert.equal(verified.passed, true);
  assert.equal(verified.summary.replayed, true);

  const tampered = {
    ...event,
    raw: {
      ...event.raw,
      totalWin: event.raw.totalWin + 1,
    },
  };
  const failed = await verifyRoundAuditEvent(tampered, profile.config);
  assert.equal(failed.passed, false);
  assert.ok(failed.failures.some((failure) => failure.includes("raw.totalWin replay mismatch")));
}

async function testRoundAuditJsonlWriteAndLoad(): Promise<void> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "round-audit-"));
  try {
    const auditPath = path.join(tmpDir, "round-audit.jsonl");
    const raw = fakeSpinResult(1.23);
    const settled = settleSpinResultDetailed(raw, "MGA");
    const event = buildRoundAuditEvent({
      roundId: createRoundId(),
      username: "audit-jsonl-user",
      token: "plain-token",
      market: "MGA",
      betCents: amountToCents(100),
      balanceBeforeCents: amountToCents(1000),
      balanceAfterDebitCents: amountToCents(900),
      balanceAfterCreditCents: amountToCents(901.23),
      mathProfile: buildDefaultMathProfileDocument().metadata,
      rngTrace: [{ index: 0, method: "pickWeighted", totalWeight: 10, weightCount: 3, value: 2 }],
      rawResult: raw,
      settled,
    });

    writeRoundAuditJsonl(event, auditPath);
    const content = readFileSync(auditPath, "utf8");
    assert.equal(content.trim().split(/\r?\n/).length, 1);
    const loaded = loadAuditEvents(auditPath);
    assert.equal(loaded[0].roundId, event.roundId);
    assert.equal((await verifyRoundAuditEvent(loaded[0])).passed, true);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  try {
    testPerWayCapWithSpinMultiplier();
    testPerWayCapMixedWays();
    testFreeSpinPaytableOverride();
    testMaxWildsAcrossCascade();
    testAbsoluteCapByMarket();
    testAtomicEventRounding();
    testRuntimeOverrideResetAndCache();
    testInvalidMathConfigRejected();
    testRuntimeMathConfigIsImmutableAfterInstall();
    testMathProfileDocumentNormalization();
    testMathProfileRuntimeLoad();
    testApprovedProfileRuntimeGate();
    testAuditedRngTrace();
    await testRoundAuditEvent();
    await testRoundAuditReplay();
    await testRoundAuditJsonlWriteAndLoad();
    resetRuntimeMathConfig();
    console.log("All tests passed.");
  } catch (error) {
    resetRuntimeMathConfig();
    throw error;
  }
}

main().catch((error) => {
  resetRuntimeMathConfig();
  throw error;
});
