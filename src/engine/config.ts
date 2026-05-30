/**
 * Static game configuration derived from math.md.
 * Single source of truth for paytable, reel strips, and engine limits.
 */
import { SymbolDef, SymbolId } from "./types";

export const ROWS = 3;
export const COLS = 5;
export const TOTAL_WAYS = 243;          // 3^5
export const MIN_MATCH = 3;

export const BET = {
  min: 0.1,
  default: 1.0,
  max: 100.0,
};

export const EXPOSURE = {
  maxWinX: 10_000,        // hard cap on single round payout (× bet)
  maxMultiplierCap: 100,  // hard cap on per-way wild multiplier before spin multiplier
  maxCascadesPerSpin: 20, // hard cap on cascade chain length
  maxWildsPerSpin: 5,     // post-generation demotion enforcement
};

export const SCATTER = {
  triggerCount: 3,
  /** Scatter pay in ×total_bet, paid in base game only. */
  payoutXBet: { 3: 25.305503, 4: 101.222011, 5: 506.110055 } as Record<number, number>,
};

export const FREE_SPINS = {
  initialSpins: 10,
  retriggerSpins: 5,
  multiplierSteps: [1, 2, 3, 5, 10] as const,
  /**
   * Max retriggers per session (math.md §7). After this many retriggers,
   * further scatters during free spins are ignored (no extra spins).
   */
  maxRetriggers: 5,
  /** initialSpins + maxRetriggers * retriggerSpins = 10 + 5*5 = 35. */
  maxTotalSpins: 35,
};

export const WILD = {
  multiplierValues: [2, 3, 5] as const,
};

/** Symbol catalogue with paytable (multipliers of bet). */
export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  A:       { id: "A",       kind: "low",     pays: { 3: 2.828703,   4: 5.657407,   5: 28.287034   } },
  K:       { id: "K",       kind: "low",     pays: { 3: 3.394444,   4: 8.48611,    5: 33.94444    } },
  Q:       { id: "Q",       kind: "low",     pays: { 3: 4.525925,   4: 11.314813,  5: 45.259253   } },
  J:       { id: "J",       kind: "low",     pays: { 3: 5.657407,   4: 16.97222,   5: 56.574066   } },
  "10":    { id: "10",      kind: "low",     pays: { 3: 8.48611,    4: 22.629627,  5: 84.8611     } },
  NINJA:   { id: "NINJA",   kind: "premium", pays: { 3: 28.395661,  4: 85.186983,  5: 283.956611  } },
  DRAGON:  { id: "DRAGON",  kind: "premium", pays: { 3: 45.433058,  4: 141.978306, 5: 454.330579  } },
  PHOENIX: { id: "PHOENIX", kind: "premium", pays: { 3: 68.149587,  4: 227.165289, 5: 681.495868  } },
  SHOGUN:  { id: "SHOGUN",  kind: "premium", pays: { 3: 113.582645, 4: 454.330579, 5: 1419.783059 } },
  WILD:    { id: "WILD",    kind: "wild" },
  SCATTER: { id: "SCATTER", kind: "scatter" },
};

/** Dedicated free-spin paytable. Kept explicit even when matching base game. */
export const FREE_SPIN_SYMBOLS: Record<SymbolId, SymbolDef> = {
  A:       { id: "A",       kind: "low",     pays: { 3: 2.828703,   4: 5.657407,   5: 28.287034   } },
  K:       { id: "K",       kind: "low",     pays: { 3: 3.394444,   4: 8.48611,    5: 33.94444    } },
  Q:       { id: "Q",       kind: "low",     pays: { 3: 4.525925,   4: 11.314813,  5: 45.259253   } },
  J:       { id: "J",       kind: "low",     pays: { 3: 5.657407,   4: 16.97222,   5: 56.574066   } },
  "10":    { id: "10",      kind: "low",     pays: { 3: 8.48611,    4: 22.629627,  5: 84.8611     } },
  NINJA:   { id: "NINJA",   kind: "premium", pays: { 3: 28.395661,  4: 85.186983,  5: 283.956611  } },
  DRAGON:  { id: "DRAGON",  kind: "premium", pays: { 3: 45.433058,  4: 141.978306, 5: 454.330579  } },
  PHOENIX: { id: "PHOENIX", kind: "premium", pays: { 3: 68.149587,  4: 227.165289, 5: 681.495868  } },
  SHOGUN:  { id: "SHOGUN",  kind: "premium", pays: { 3: 113.582645, 4: 454.330579, 5: 1419.783059 } },
  WILD:    { id: "WILD",    kind: "wild" },
  SCATTER: { id: "SCATTER", kind: "scatter" },
};

/** Per-reel strip symbol counts from math.md Section 8. */
export const REEL_SYMBOL_COUNTS: Array<Record<SymbolId, number>> = [
  // Reel 1 — total 294
  { A: 60, K: 55, Q: 50, J: 45, "10": 40, NINJA: 16, DRAGON: 11, PHOENIX: 7, SHOGUN: 4, WILD: 1, SCATTER: 11 },
  // Reel 2 — total 305
  { A: 60, K: 55, Q: 50, J: 45, "10": 40, NINJA: 19, DRAGON: 13, PHOENIX: 9, SHOGUN: 5, WILD: 2, SCATTER: 8 },
  // Reel 3 — total 293
  { A: 55, K: 50, Q: 45, J: 40, "10": 35, NINJA: 21, DRAGON: 16, PHOENIX: 11, SHOGUN: 6, WILD: 3, SCATTER: 16 },
  // Reel 4 — total 305
  { A: 60, K: 55, Q: 50, J: 45, "10": 40, NINJA: 19, DRAGON: 13, PHOENIX: 9, SHOGUN: 5, WILD: 2, SCATTER: 8 },
  // Reel 5 — total 294
  { A: 60, K: 55, Q: 50, J: 45, "10": 40, NINJA: 16, DRAGON: 11, PHOENIX: 7, SHOGUN: 4, WILD: 1, SCATTER: 11 },
];

/**
 * Free-spin reel symbol counts. Starts identical to base game and can diverge
 * when math tuning needs a dedicated feature reel set.
 */
export const FREE_SPIN_REEL_SYMBOL_COUNTS: Array<Record<SymbolId, number>> = REEL_SYMBOL_COUNTS.map((counts) => ({ ...counts }));

export const REEL_STRIP_ORDERS: SymbolId[][] = [
  ["A", "10", "K", "NINJA", "Q", "J", "DRAGON", "A", "SCATTER", "K", "PHOENIX", "Q", "WILD", "J", "SHOGUN"],
  ["K", "A", "Q", "NINJA", "10", "J", "DRAGON", "K", "SCATTER", "A", "PHOENIX", "Q", "WILD", "10", "SHOGUN"],
  ["Q", "A", "J", "NINJA", "10", "K", "DRAGON", "Q", "SCATTER", "A", "PHOENIX", "J", "WILD", "10", "SHOGUN"],
  ["J", "K", "A", "NINJA", "Q", "10", "DRAGON", "J", "SCATTER", "K", "PHOENIX", "A", "WILD", "Q", "SHOGUN"],
  ["10", "A", "K", "NINJA", "Q", "J", "DRAGON", "10", "SCATTER", "A", "PHOENIX", "K", "WILD", "Q", "SHOGUN"],
];

export const FREE_SPIN_REEL_STRIP_ORDERS: SymbolId[][] = REEL_STRIP_ORDERS.map((order) => [...order]);

/** Compatibility export for API/debug output that still refers to reel weights. */
export const REEL_WEIGHTS = REEL_SYMBOL_COUNTS;

/** Premium symbols, used for wild substitution checks. */
export const PREMIUM_SYMBOLS: SymbolId[] = ["NINJA", "DRAGON", "PHOENIX", "SHOGUN"];
export const LOW_SYMBOLS: SymbolId[] = ["A", "K", "Q", "J", "10"];

/** Symbols a wild can substitute for (everything except SCATTER and WILD itself). */
export const PAYABLE_SYMBOLS: SymbolId[] = [...LOW_SYMBOLS, ...PREMIUM_SYMBOLS];
