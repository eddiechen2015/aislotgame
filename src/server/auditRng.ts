import { defaultRng, RNG } from "../engine/rng";

export type RngTraceEntry =
  | { index: number; method: "next"; value: number }
  | { index: number; method: "nextInt"; n: number; value: number }
  | { index: number; method: "pickWeighted"; totalWeight: number; weightCount: number; value: number };

type RngTraceEntryPayload =
  | { method: "next"; value: number }
  | { method: "nextInt"; n: number; value: number }
  | { method: "pickWeighted"; totalWeight: number; weightCount: number; value: number };

export interface AuditedRng {
  rng: RNG;
  trace: RngTraceEntry[];
}

export function createAuditedRng(base: RNG = defaultRng()): AuditedRng {
  const trace: RngTraceEntry[] = [];
  const push = (entry: RngTraceEntryPayload) => {
    trace.push({ index: trace.length, ...entry });
  };

  return {
    trace,
    rng: {
      next() {
        const value = base.next();
        push({ method: "next", value });
        return value;
      },
      nextInt(n: number) {
        const value = base.nextInt(n);
        push({ method: "nextInt", n, value });
        return value;
      },
      pickWeighted(weights: number[]) {
        const value = base.pickWeighted(weights);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        push({ method: "pickWeighted", totalWeight, weightCount: weights.length, value });
        return value;
      },
    },
  };
}
