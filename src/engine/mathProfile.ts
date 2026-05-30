import {
  FREE_SPIN_SYMBOLS,
  FREE_SPIN_REEL_STRIP_ORDERS,
  FREE_SPIN_REEL_SYMBOL_COUNTS,
  PAYABLE_SYMBOLS,
  REEL_STRIP_ORDERS,
  REEL_SYMBOL_COUNTS,
  SCATTER,
  SYMBOLS,
} from "./config";
import type { RuntimeMathConfig } from "./mathRuntime";

export type MathProfileStatus = "candidate" | "verified" | "approved" | "rejected";

export interface MetricTarget {
  target: number;
  tolerance: number;
}

export interface MaxMetricTarget {
  max: number;
}

export interface MathProfileTargets {
  rtp: MetricTarget;
  baseRtp: MetricTarget;
  fsRtp: MetricTarget;
  hitFreq: MetricTarget;
  fsFreq: MetricTarget;
  stdDevX: MetricTarget;
  maxWinX: MaxMetricTarget;
}

export interface MathProfileVerificationMetadata {
  passed: boolean;
  verifiedAt: string;
  market: string;
  spinsPerSeed: number;
  seeds: number[];
  aggregate: {
    rtp: number;
    baseRtp: number;
    fsRtp: number;
    hitFreq: number;
    fsFreq: number;
    stdDevX: number;
    maxWinX: number;
  };
  failures: string[];
  reportPath?: string;
}

export interface MathProfileMetadata {
  schemaVersion: 1;
  profileId: string;
  profileVersion: string;
  gameCode: string;
  gameVersion: string;
  status: MathProfileStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  targets: MathProfileTargets;
  verification?: MathProfileVerificationMetadata;
  notes?: string[];
}

export interface MathProfileDocument {
  metadata: MathProfileMetadata;
  config: RuntimeMathConfig;
}

export const DEFAULT_MATH_PROFILE_TARGETS: MathProfileTargets = {
  rtp: { target: 0.962, tolerance: 0.001 },
  baseRtp: { target: 0.58, tolerance: 0.01 },
  fsRtp: { target: 0.382, tolerance: 0.01 },
  hitFreq: { target: 0.30, tolerance: 0.02 },
  fsFreq: { target: 1 / 130, tolerance: 0.0015 },
  stdDevX: { target: 40, tolerance: 10 },
  maxWinX: { max: 10_000 },
};

function nowIso(): string {
  return new Date().toISOString();
}

export function buildDefaultRuntimeMathConfig(): RuntimeMathConfig {
  return {
    baseSymbols: structuredClone(SYMBOLS),
    freeSpinSymbols: structuredClone(FREE_SPIN_SYMBOLS),
    baseScatterPayoutXBet: { ...SCATTER.payoutXBet },
    baseReelSymbolCounts: REEL_SYMBOL_COUNTS.map((counts) => ({ ...counts })),
    baseReelStripOrders: REEL_STRIP_ORDERS.map((order) => [...order]),
    freeSpinReelSymbolCounts: FREE_SPIN_REEL_SYMBOL_COUNTS.map((counts) => ({ ...counts })),
    freeSpinReelStripOrders: FREE_SPIN_REEL_STRIP_ORDERS.map((order) => [...order]),
    payableSymbols: [...PAYABLE_SYMBOLS],
  };
}

export function buildMathProfileDocument(
  config: RuntimeMathConfig,
  metadata: Partial<MathProfileMetadata> = {},
): MathProfileDocument {
  const timestamp = nowIso();
  return {
    metadata: {
      schemaVersion: 1,
      profileId: metadata.profileId ?? "asian-tour-default",
      profileVersion: metadata.profileVersion ?? "0.1.0",
      gameCode: metadata.gameCode ?? "ASIAN-TOUR-01",
      gameVersion: metadata.gameVersion ?? "0.1.0",
      status: metadata.status ?? "candidate",
      source: metadata.source ?? "default-static-config",
      createdAt: metadata.createdAt ?? timestamp,
      updatedAt: metadata.updatedAt ?? timestamp,
      targets: metadata.targets ?? DEFAULT_MATH_PROFILE_TARGETS,
      verification: metadata.verification,
      notes: metadata.notes,
    },
    config,
  };
}

export function buildDefaultMathProfileDocument(): MathProfileDocument {
  return buildMathProfileDocument(buildDefaultRuntimeMathConfig(), {
    profileId: "asian-tour-default",
    profileVersion: "0.1.0",
    status: "candidate",
    source: "default-static-config",
    notes: ["Exported from static TypeScript config."],
  });
}

export function isMathProfileDocument(value: unknown): value is MathProfileDocument {
  return !!value &&
    typeof value === "object" &&
    "metadata" in value &&
    "config" in value;
}

export function normalizeMathProfileDocument(
  value: unknown,
  metadata: Partial<MathProfileMetadata> = {},
): MathProfileDocument {
  if (isMathProfileDocument(value)) {
    return buildMathProfileDocument(value.config, {
      ...value.metadata,
      ...metadata,
      targets: metadata.targets ?? value.metadata.targets ?? DEFAULT_MATH_PROFILE_TARGETS,
      verification: metadata.verification ?? value.metadata.verification,
      notes: metadata.notes ?? value.metadata.notes,
    });
  }

  return buildMathProfileDocument(value as RuntimeMathConfig, {
    profileId: metadata.profileId ?? "imported-raw-profile",
    profileVersion: metadata.profileVersion ?? "unversioned",
    status: metadata.status ?? "candidate",
    source: metadata.source ?? "legacy-raw-runtime-config",
    notes: metadata.notes ?? ["Imported from legacy raw RuntimeMathConfig JSON."],
    targets: metadata.targets ?? DEFAULT_MATH_PROFILE_TARGETS,
  });
}
