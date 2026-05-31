/**
 * RNG abstraction. Uses Mulberry32 so simulations can be made
 * deterministic by passing a seed. For production this would be
 * swapped for a certified RNG (GLI-11) — see overview.md.
 */

export interface RNG {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  nextInt(n: number): number;
  /** Weighted pick — returns index whose weight bucket the roll falls into. */
  pickWeighted(weights: number[]): number;
}

/** Deterministic 32-bit PRNG. */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(n: number) {
      return Math.floor(next() * n);
    },
    pickWeighted(weights: number[]) {
      if (weights.length === 0) throw new Error("pickWeighted called with empty weights array");
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) throw new Error("pickWeighted called with non-positive total weight");
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

/** Non-seeded RNG backed by Math.random — used for production-like spins. */
export function defaultRng(): RNG {
  return {
    next: Math.random,
    nextInt(n) { return Math.floor(Math.random() * n); },
    pickWeighted(weights: number[]) {
      if (weights.length === 0) throw new Error("pickWeighted called with empty weights array");
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) throw new Error("pickWeighted called with non-positive total weight");
      let r = Math.random() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}
