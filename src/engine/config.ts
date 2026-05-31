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

/**
 * Symbol catalogue with paytable (multipliers of bet).
 *
 * Paytable is the v0.2.0 retune (line pays scaled ~6.74x over the original
 * base values) that lands total RTP at 96.2% with a 58/38 base/FS split and a
 * ~30% hit frequency. See artifacts/approved.mathProfile.json + ARCHITECTURE.md.
 * NOTE: Q / J / 10 are deliberately NOT in PAYABLE_SYMBOLS (pseudo-blanks); the
 * pays kept here are unused at runtime and retained only for documentation.
 */
export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  A:       { id: "A",       kind: "low",     pays: { 3: 19.065458,  4: 38.130923,   5: 190.654609  } },
  K:       { id: "K",       kind: "low",     pays: { 3: 22.878553,  4: 57.196381,   5: 228.785526  } },
  Q:       { id: "Q",       kind: "low",     pays: { 3: 30.504735,  4: 76.26184,    5: 305.047365  } },
  J:       { id: "J",       kind: "low",     pays: { 3: 38.130923,  4: 114.392763,  5: 381.309205  } },
  "10":    { id: "10",      kind: "low",     pays: { 3: 57.196381,  4: 152.523686,  5: 571.963814  } },
  NINJA:   { id: "NINJA",   kind: "premium", pays: { 3: 191.386755, 4: 574.160265,  5: 1913.867558 } },
  DRAGON:  { id: "DRAGON",  kind: "premium", pays: { 3: 306.218811, 4: 956.933782,  5: 3062.188102 } },
  PHOENIX: { id: "PHOENIX", kind: "premium", pays: { 3: 459.328216, 4: 1531.094048, 5: 4593.28215  } },
  SHOGUN:  { id: "SHOGUN",  kind: "premium", pays: { 3: 765.547027, 4: 3062.188102, 5: 9569.337818 } },
  WILD:    { id: "WILD",    kind: "wild" },
  SCATTER: { id: "SCATTER", kind: "scatter" },
};

/**
 * Dedicated free-spin paytable (v0.2.0 retune: ~7.7x over original FS values).
 * Free spins carry 38.2% RTP — the volatility engine, amplified by the per-spin
 * multiplier ladder. Q / J / 10 are pseudo-blanks (see PAYABLE_SYMBOLS).
 */
export const FREE_SPIN_SYMBOLS: Record<SymbolId, SymbolDef> = {
  A:       { id: "A",       kind: "low",     pays: { 3: 21.781013,  4: 43.562034,   5: 217.810162   } },
  K:       { id: "K",       kind: "low",     pays: { 3: 26.137219,  4: 65.343047,   5: 261.372188   } },
  Q:       { id: "Q",       kind: "low",     pays: { 3: 34.849623,  4: 87.12406,    5: 348.496248   } },
  J:       { id: "J",       kind: "low",     pays: { 3: 43.562034,  4: 130.686094,  5: 435.620308   } },
  "10":    { id: "10",      kind: "low",     pays: { 3: 65.343047,  4: 174.248128,  5: 653.43047    } },
  NINJA:   { id: "NINJA",   kind: "premium", pays: { 3: 218.64659,  4: 655.939769,  5: 2186.465905  } },
  DRAGON:  { id: "DRAGON",  kind: "premium", pays: { 3: 349.834547, 4: 1093.232956, 5: 3498.345458  } },
  PHOENIX: { id: "PHOENIX", kind: "premium", pays: { 3: 524.75182,  4: 1749.172725, 5: 5247.518184  } },
  SHOGUN:  { id: "SHOGUN",  kind: "premium", pays: { 3: 874.586367, 4: 3498.345458, 5: 10932.329554 } },
  WILD:    { id: "WILD",    kind: "wild" },
  SCATTER: { id: "SCATTER", kind: "scatter" },
};

/**
 * Per-reel strip symbol counts (v0.2.0 retune; reel totals 300/306/298/306/300).
 * Scatter density lowered vs the original (free-spin frequency ~1 in 117) while
 * per-reel totals are preserved. Q / J / 10 still occupy the reels but no longer
 * pay (pseudo-blanks) which pulls hit frequency down to ~30%.
 */
export const REEL_SYMBOL_COUNTS: Array<Record<SymbolId, number>> = [
  { A: 61, K: 56, Q: 50, J: 45, "10": 40, NINJA: 16, DRAGON: 11, PHOENIX: 7, SHOGUN: 4, WILD: 1, SCATTER: 9 },
  { A: 61, K: 56, Q: 50, J: 45, "10": 40, NINJA: 19, DRAGON: 13, PHOENIX: 9, SHOGUN: 5, WILD: 2, SCATTER: 6 },
  { A: 56, K: 51, Q: 45, J: 40, "10": 35, NINJA: 21, DRAGON: 16, PHOENIX: 11, SHOGUN: 6, WILD: 3, SCATTER: 14 },
  { A: 61, K: 56, Q: 50, J: 45, "10": 40, NINJA: 19, DRAGON: 13, PHOENIX: 9, SHOGUN: 5, WILD: 2, SCATTER: 6 },
  { A: 61, K: 56, Q: 50, J: 45, "10": 40, NINJA: 16, DRAGON: 11, PHOENIX: 7, SHOGUN: 4, WILD: 1, SCATTER: 9 },
];

/**
 * Free-spin reel symbol counts (v0.2.0 retune). A dedicated, premium- and
 * wild-richer reel set than the base game (NINJA..SHOGUN +4, WILD +2 per reel,
 * rebalanced out of the low symbols) so free spins deliver their 38.2% RTP.
 */
export const FREE_SPIN_REEL_SYMBOL_COUNTS: Array<Record<SymbolId, number>> = [
  { A: 49, K: 49, Q: 49, J: 45, "10": 40, NINJA: 20, DRAGON: 15, PHOENIX: 11, SHOGUN: 8, WILD: 3, SCATTER: 11 },
  { A: 49, K: 49, Q: 49, J: 45, "10": 40, NINJA: 23, DRAGON: 17, PHOENIX: 13, SHOGUN: 9, WILD: 4, SCATTER: 8 },
  { A: 44, K: 44, Q: 44, J: 40, "10": 35, NINJA: 25, DRAGON: 20, PHOENIX: 15, SHOGUN: 10, WILD: 5, SCATTER: 16 },
  { A: 49, K: 49, Q: 49, J: 45, "10": 40, NINJA: 23, DRAGON: 17, PHOENIX: 13, SHOGUN: 9, WILD: 4, SCATTER: 8 },
  { A: 49, K: 49, Q: 49, J: 45, "10": 40, NINJA: 20, DRAGON: 15, PHOENIX: 11, SHOGUN: 8, WILD: 3, SCATTER: 11 },
];

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

/**
 * Symbols evaluated for line wins (and that a wild substitutes for).
 *
 * v0.2.0 retune: Q / J / 10 are intentionally EXCLUDED. They still appear on the
 * reels but never form or extend a winning way — acting as pseudo-blanks that
 * break left-to-right chains. This is the lever that lowers hit frequency from
 * ~48% to ~30% without an engine-level blank symbol. For a player-facing build,
 * replacing them with a dedicated BLANK art symbol is the cleaner long-term fix.
 */
export const PAYABLE_SYMBOLS: SymbolId[] = ["A", "K", ...PREMIUM_SYMBOLS];
