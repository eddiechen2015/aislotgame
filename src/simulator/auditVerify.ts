import { readFileSync } from "node:fs";

import { RuntimeMathConfig, withRuntimeMathConfig } from "../engine/mathRuntime";
import { RNG } from "../engine/rng";
import { SpinResult, playRound } from "../engine/spinEngine";
import { RoundAuditEvent } from "../server/audit";
import { RngTraceEntry } from "../server/auditRng";
import { amountToCents, centsToAmount } from "../server/money";
import { settleSpinResultDetailed } from "../settlement/settleSpin";
import { loadProfileDocument } from "./verifyProfile";

interface VerificationResult {
  roundId: string;
  passed: boolean;
  failures: string[];
  summary: {
    market: string;
    betCents: number;
    totalWinCents: number;
    rngTraceCount: number;
    profileId: string;
    profileVersion: string;
    capEventCount: number;
    replayed: boolean;
  };
}

function traceEntryLabel(entry: RngTraceEntry): string {
  return `rng trace entry ${entry.index} (${entry.method})`;
}

function createReplayRng(trace: RngTraceEntry[]): { rng: RNG; consumedCount: () => number } {
  let cursor = 0;

  function consume(method: RngTraceEntry["method"]): RngTraceEntry {
    const entry = trace[cursor];
    if (!entry) throw new Error(`replay exhausted RNG trace at index ${cursor}; expected ${method}`);
    if (entry.index !== cursor) throw new Error(`replay expected trace index ${cursor}, got ${entry.index}`);
    if (entry.method !== method) {
      throw new Error(`replay expected RNG method ${method} at index ${cursor}, got ${entry.method}`);
    }
    cursor += 1;
    return entry;
  }

  return {
    consumedCount: () => cursor,
    rng: {
      next() {
        const entry = consume("next");
        if (entry.method !== "next") throw new Error("unreachable RNG next replay state");
        return entry.value;
      },
      nextInt(n: number) {
        const entry = consume("nextInt");
        if (entry.method !== "nextInt") throw new Error("unreachable RNG nextInt replay state");
        if (entry.n !== n) {
          throw new Error(`${traceEntryLabel(entry)} expected n=${entry.n}, replay requested n=${n}`);
        }
        return entry.value;
      },
      pickWeighted(weights: number[]) {
        const entry = consume("pickWeighted");
        if (entry.method !== "pickWeighted") throw new Error("unreachable RNG pickWeighted replay state");
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        if (entry.weightCount !== weights.length) {
          throw new Error(`${traceEntryLabel(entry)} expected weightCount=${entry.weightCount}, replay requested ${weights.length}`);
        }
        if (Math.abs(entry.totalWeight - totalWeight) > 1e-9) {
          throw new Error(`${traceEntryLabel(entry)} expected totalWeight=${entry.totalWeight}, replay requested ${totalWeight}`);
        }
        return entry.value;
      },
    },
  };
}

// 使用相对 + 绝对容差混合，避免大数场景下 1e-9 绝对容差太严格
function approxEqual(actual: number, expected: number, epsilon = 1e-9): boolean {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(1, Math.abs(expected), Math.abs(actual));
  return diff <= epsilon * scale;
}

function assertNumberEqual(failures: string[], label: string, actual: number, expected: number, epsilon = 1e-9): void {
  if (!approxEqual(actual, expected, epsilon)) {
    failures.push(`${label} replay mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertCentsEqual(failures: string[], label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    failures.push(`${label} replay mismatch: expected ${expected}, got ${actual}`);
  }
}

async function replayRound(
  event: RoundAuditEvent,
  profile: RuntimeMathConfig,
): Promise<{ raw: SpinResult; settled: ReturnType<typeof settleSpinResultDetailed> }> {
  return withRuntimeMathConfig(profile, () => {
    const replay = createReplayRng(event.rng.trace);
    const raw = playRound(centsToAmount(event.betCents), replay.rng);
    if (replay.consumedCount() !== event.rng.trace.length) {
      throw new Error(`replay consumed ${replay.consumedCount()} RNG entries, audit contains ${event.rng.trace.length}`);
    }
    const settled = settleSpinResultDetailed(raw, event.market);
    return { raw, settled };
  });
}

export async function verifyRoundAuditReplay(event: RoundAuditEvent, profile: RuntimeMathConfig): Promise<string[]> {
  const failures: string[] = [];
  let replayed: { raw: SpinResult; settled: ReturnType<typeof settleSpinResultDetailed> };
  try {
    replayed = await replayRound(event, profile);
  } catch (error) {
    return [`replay failed: ${(error as Error).message}`];
  }

  const { raw, settled } = replayed;
  assertNumberEqual(failures, "raw.totalWin", event.raw.totalWin, raw.totalWin);
  assertNumberEqual(failures, "raw.baseCascadeWin", event.raw.baseCascadeWin, raw.base.cascadeWin);
  assertNumberEqual(failures, "raw.scatterPay", event.raw.scatterPay, raw.base.scatterPay);
  if (event.raw.scatterCount !== raw.base.scatterCount) {
    failures.push(`raw.scatterCount replay mismatch: expected ${event.raw.scatterCount}, got ${raw.base.scatterCount}`);
  }
  if (event.raw.freeSpinsTriggered !== raw.base.freeSpinsTriggered) {
    failures.push(`raw.freeSpinsTriggered replay mismatch: expected ${event.raw.freeSpinsTriggered}, got ${raw.base.freeSpinsTriggered}`);
  }
  assertNumberEqual(failures, "raw.freeSpinTotalWin", event.raw.freeSpinTotalWin, raw.freeSpins?.totalWin ?? 0);
  if (event.raw.freeSpinTotalSpins !== (raw.freeSpins?.totalSpins ?? 0)) {
    failures.push(`raw.freeSpinTotalSpins replay mismatch: expected ${event.raw.freeSpinTotalSpins}, got ${raw.freeSpins?.totalSpins ?? 0}`);
  }
  if (event.raw.capped !== raw.capped) {
    failures.push(`raw.capped replay mismatch: expected ${event.raw.capped}, got ${raw.capped}`);
  }

  assertCentsEqual(failures, "settled.totalWinCents", event.settled.totalWinCents, amountToCents(settled.settled.totalWin));
  assertNumberEqual(failures, "settled.totalWin", event.settled.totalWin, settled.settled.totalWin);
  assertNumberEqual(failures, "settled.baseCascadeWin", event.settled.baseCascadeWin, settled.settled.base.cascadeWin);
  assertNumberEqual(failures, "settled.scatterPay", event.settled.scatterPay, settled.settled.base.scatterPay);
  assertNumberEqual(failures, "settled.freeSpinTotalWin", event.settled.freeSpinTotalWin, settled.settled.freeSpins?.totalWin ?? 0);
  if (event.settled.capped !== settled.settled.capped) {
    failures.push(`settled.capped replay mismatch: expected ${event.settled.capped}, got ${settled.settled.capped}`);
  }
  if (event.settled.absoluteCapped !== settled.absoluteCapped) {
    failures.push(`settled.absoluteCapped replay mismatch: expected ${event.settled.absoluteCapped}, got ${settled.absoluteCapped}`);
  }
  if (event.capEvents.length !== settled.auditEvents.length) {
    failures.push(`capEvents count replay mismatch: expected ${event.capEvents.length}, got ${settled.auditEvents.length}`);
  }
  settled.auditEvents.forEach((expected, index) => {
    const actual = event.capEvents[index];
    if (!actual) return;
    if (actual.market !== expected.market) failures.push(`capEvent ${index}.market replay mismatch`);
    if (actual.scope !== expected.scope) failures.push(`capEvent ${index}.scope replay mismatch`);
    if (actual.spinIndex !== expected.spinIndex) failures.push(`capEvent ${index}.spinIndex replay mismatch`);
    assertCentsEqual(failures, `capEvent ${index}.requestedWin`, actual.requestedWin, expected.requestedWin);
    assertCentsEqual(failures, `capEvent ${index}.paidWin`, actual.paidWin, expected.paidWin);
    assertCentsEqual(failures, `capEvent ${index}.cap`, actual.cap, expected.cap);
  });

  return failures;
}

export function loadAuditEvents(pathname: string): RoundAuditEvent[] {
  return readFileSync(pathname, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as RoundAuditEvent;
      } catch (error) {
        throw new Error(`invalid JSON on line ${index + 1}: ${(error as Error).message}`);
      }
    });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function verifyRoundAuditEvent(
  event: RoundAuditEvent,
  profile?: RuntimeMathConfig,
): Promise<VerificationResult> {
  return verifyRoundAuditEventAsync(event, profile);
}

export async function verifyRoundAuditEventAsync(
  event: RoundAuditEvent,
  profile?: RuntimeMathConfig,
): Promise<VerificationResult> {
  const failures: string[] = [];

  if (!event.roundId || !event.roundId.startsWith("round_")) failures.push("roundId is missing or invalid");
  if (!event.timestamp) failures.push("timestamp is missing");
  if (!event.username) failures.push("username is missing");
  if (!/^[a-f0-9]{64}$/.test(event.tokenHash)) failures.push("tokenHash must be a SHA-256 hex digest");
  if (!event.market) failures.push("market is missing");
  if (!Number.isInteger(event.betCents) || event.betCents <= 0) failures.push("betCents must be a positive integer");

  if (!Number.isInteger(event.balanceBeforeCents)) failures.push("balanceBeforeCents must be an integer");
  if (!Number.isInteger(event.balanceAfterDebitCents)) failures.push("balanceAfterDebitCents must be an integer");
  if (!Number.isInteger(event.balanceAfterCreditCents)) failures.push("balanceAfterCreditCents must be an integer");
  if (event.balanceBeforeCents - event.betCents !== event.balanceAfterDebitCents) {
    failures.push("balanceAfterDebitCents does not equal balanceBeforeCents - betCents");
  }
  if (event.balanceAfterDebitCents + event.settled.totalWinCents !== event.balanceAfterCreditCents) {
    failures.push("balanceAfterCreditCents does not equal balanceAfterDebitCents + totalWinCents");
  }

  if (!event.mathProfile?.profileId) failures.push("mathProfile.profileId is missing");
  if (!event.mathProfile?.profileVersion) failures.push("mathProfile.profileVersion is missing");
  if (!event.mathProfile?.status) failures.push("mathProfile.status is missing");

  if (event.rng.provider !== "Math.random") failures.push("rng.provider is unsupported");
  if (event.rng.traceCount !== event.rng.trace.length) failures.push("rng.traceCount does not match trace length");
  event.rng.trace.forEach((entry, index) => {
    if (entry.index !== index) failures.push(`rng trace entry ${index} has wrong index ${entry.index}`);
    if (entry.method === "next") {
      if (!isFiniteNumber(entry.value) || entry.value < 0 || entry.value >= 1) {
        failures.push(`rng next entry ${index} has invalid value`);
      }
    } else if (entry.method === "nextInt") {
      if (!Number.isInteger(entry.n) || entry.n <= 0) failures.push(`rng nextInt entry ${index} has invalid n`);
      if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value >= entry.n) {
        failures.push(`rng nextInt entry ${index} has invalid value`);
      }
    } else if (entry.method === "pickWeighted") {
      if (!isFiniteNumber(entry.totalWeight) || entry.totalWeight <= 0) failures.push(`rng pickWeighted entry ${index} has invalid totalWeight`);
      if (!Number.isInteger(entry.weightCount) || entry.weightCount <= 0) failures.push(`rng pickWeighted entry ${index} has invalid weightCount`);
      if (!Number.isInteger(entry.value) || entry.value < 0 || entry.value >= entry.weightCount) {
        failures.push(`rng pickWeighted entry ${index} has invalid value`);
      }
    } else {
      failures.push(`rng trace entry ${index} has unknown method`);
    }
  });

  if (!isFiniteNumber(event.raw.totalWin)) failures.push("raw.totalWin must be numeric");
  if (!isFiniteNumber(event.raw.baseCascadeWin)) failures.push("raw.baseCascadeWin must be numeric");
  if (!isFiniteNumber(event.raw.scatterPay)) failures.push("raw.scatterPay must be numeric");
  if (!isFiniteNumber(event.raw.freeSpinTotalWin)) failures.push("raw.freeSpinTotalWin must be numeric");

  if (!Number.isInteger(event.settled.totalWinCents) || event.settled.totalWinCents < 0) {
    failures.push("settled.totalWinCents must be a non-negative integer");
  }
  const centsFromAmount = Math.round(event.settled.totalWin * 100);
  if (centsFromAmount !== event.settled.totalWinCents) {
    failures.push("settled.totalWin does not match settled.totalWinCents");
  }

  event.capEvents.forEach((capEvent, index) => {
    if (capEvent.market !== event.market) failures.push(`capEvent ${index} market does not match round market`);
    if (!Number.isInteger(capEvent.requestedWin) || capEvent.requestedWin < 0) failures.push(`capEvent ${index} requestedWin invalid`);
    if (!Number.isInteger(capEvent.paidWin) || capEvent.paidWin < 0) failures.push(`capEvent ${index} paidWin invalid`);
    if (!Number.isInteger(capEvent.cap) || capEvent.cap <= 0) failures.push(`capEvent ${index} cap invalid`);
    if (capEvent.paidWin > capEvent.cap) failures.push(`capEvent ${index} paidWin exceeds cap`);
  });

  if (profile) {
    failures.push(...await verifyRoundAuditReplay(event, profile));
  }

  return {
    roundId: event.roundId,
    passed: failures.length === 0,
    failures,
    summary: {
      market: event.market,
      betCents: event.betCents,
      totalWinCents: event.settled.totalWinCents,
      rngTraceCount: event.rng.traceCount,
      profileId: event.mathProfile.profileId,
      profileVersion: event.mathProfile.profileVersion,
      capEventCount: event.capEvents.length,
      replayed: !!profile,
    },
  };
}

async function main(): Promise<void> {
  const auditPath = process.argv[2] ?? "artifacts/audit/round-audit.jsonl";
  const roundId = process.argv[3];
  const profilePath = process.argv[4];
  if (!roundId) throw new Error("usage: npm run audit:verify -- <audit.jsonl> <roundId> [profile.json]");

  const events = loadAuditEvents(auditPath);
  const event = events.find((entry) => entry.roundId === roundId);
  if (!event) throw new Error(`roundId not found: ${roundId}`);

  const profile = profilePath ? loadProfileDocument(profilePath).config : undefined;
  const result = await verifyRoundAuditEvent(event, profile);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
