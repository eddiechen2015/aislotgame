import { createHash } from "crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { SpinResult } from "../engine/spinEngine";
import { MathProfileMetadata } from "../engine/mathProfile";
import { Market } from "../gameMarkets";
import { centsToAmount } from "./money";
import { RngTraceEntry } from "./auditRng";
import { settleSpinResultDetailed } from "../settlement/settleSpin";

export interface AbsoluteCapAuditEvent {
  market: Market;
  scope: "base" | "free_spin";
  spinIndex?: number;
  requestedWin: number;
  paidWin: number;
  cap: number;
}

export interface RoundAuditEvent {
  roundId: string;
  timestamp: string;
  username: string;
  tokenHash: string;
  market: Market;
  betCents: number;
  balanceBeforeCents: number;
  balanceAfterDebitCents: number;
  balanceAfterCreditCents: number;
  mathProfile: Pick<MathProfileMetadata, "profileId" | "profileVersion" | "status" | "source">;
  rng: {
    provider: "Math.random";
    traceCount: number;
    trace: RngTraceEntry[];
  };
  raw: {
    totalWin: number;
    baseCascadeWin: number;
    scatterPay: number;
    scatterCount: number;
    freeSpinsTriggered: boolean;
    freeSpinTotalWin: number;
    freeSpinTotalSpins: number;
    capped: boolean;
  };
  settled: {
    totalWinCents: number;
    totalWin: number;
    baseCascadeWin: number;
    scatterPay: number;
    freeSpinTotalWin: number;
    capped: boolean;
    absoluteCapped: boolean;
  };
  capEvents: AbsoluteCapAuditEvent[];
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function logAbsoluteCapAudit(event: AbsoluteCapAuditEvent, context: {
  username: string;
  token: string;
  bet: number;
  roundId?: string;
}): void {
  console.warn("[absolute-win-cap]", JSON.stringify({
    ...event,
    username: context.username,
    tokenHash: hashToken(context.token),
    roundId: context.roundId,
    bet: context.bet,
    requestedWin: centsToAmount(event.requestedWin),
    paidWin: centsToAmount(event.paidWin),
    cap: centsToAmount(event.cap),
    timestamp: new Date().toISOString(),
  }));
}

export function buildRoundAuditEvent(args: {
  roundId: string;
  username: string;
  token: string;
  market: Market;
  betCents: number;
  balanceBeforeCents: number;
  balanceAfterDebitCents: number;
  balanceAfterCreditCents: number;
  mathProfile: MathProfileMetadata;
  rngTrace: RngTraceEntry[];
  rawResult: SpinResult;
  settled: ReturnType<typeof settleSpinResultDetailed>;
}): RoundAuditEvent {
  return {
    roundId: args.roundId,
    timestamp: new Date().toISOString(),
    username: args.username,
    tokenHash: hashToken(args.token),
    market: args.market,
    betCents: args.betCents,
    balanceBeforeCents: args.balanceBeforeCents,
    balanceAfterDebitCents: args.balanceAfterDebitCents,
    balanceAfterCreditCents: args.balanceAfterCreditCents,
    mathProfile: {
      profileId: args.mathProfile.profileId,
      profileVersion: args.mathProfile.profileVersion,
      status: args.mathProfile.status,
      source: args.mathProfile.source,
    },
    rng: {
      provider: "Math.random",
      traceCount: args.rngTrace.length,
      trace: args.rngTrace,
    },
    raw: {
      totalWin: args.rawResult.totalWin,
      baseCascadeWin: args.rawResult.base.cascadeWin,
      scatterPay: args.rawResult.base.scatterPay,
      scatterCount: args.rawResult.base.scatterCount,
      freeSpinsTriggered: args.rawResult.base.freeSpinsTriggered,
      freeSpinTotalWin: args.rawResult.freeSpins?.totalWin ?? 0,
      freeSpinTotalSpins: args.rawResult.freeSpins?.totalSpins ?? 0,
      capped: args.rawResult.capped,
    },
    settled: {
      totalWinCents: Math.round(args.settled.settled.totalWin * 100),
      totalWin: args.settled.settled.totalWin,
      baseCascadeWin: args.settled.settled.base.cascadeWin,
      scatterPay: args.settled.settled.base.scatterPay,
      freeSpinTotalWin: args.settled.settled.freeSpins?.totalWin ?? 0,
      capped: args.settled.settled.capped,
      absoluteCapped: args.settled.absoluteCapped,
    },
    capEvents: args.settled.auditEvents,
  };
}

export function logRoundAudit(event: RoundAuditEvent): void {
  console.info("[round-audit]", JSON.stringify(event));
  writeRoundAuditAsync(event).catch((err) => {
    console.error("[audit-write-fail]", err instanceof Error ? err.message : String(err));
  });
}

export function roundAuditPath(env = process.env): string {
  return path.resolve(process.cwd(), env.ROUND_AUDIT_PATH ?? "artifacts/audit/round-audit.jsonl");
}

async function writeRoundAuditAsync(event: RoundAuditEvent, pathname = roundAuditPath()): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  await appendFile(pathname, JSON.stringify(event) + "\n", "utf8");
}

/** Synchronous variant for tools that require blocking writes (e.g. test harnesses). */
export function writeRoundAuditJsonl(event: RoundAuditEvent, pathname = roundAuditPath()): void {
  mkdirSync(path.dirname(pathname), { recursive: true });
  appendFileSync(pathname, JSON.stringify(event) + "\n", "utf8");
}
