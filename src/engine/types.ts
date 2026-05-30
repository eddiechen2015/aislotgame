/**
 * Core types for the Asian Tour slot engine.
 * See math.md for the authoritative spec.
 */

export type SymbolId =
  | "A" | "K" | "Q" | "J" | "10"
  | "NINJA" | "DRAGON" | "PHOENIX" | "SHOGUN"
  | "WILD" | "SCATTER";

export type SymbolKind = "low" | "premium" | "wild" | "scatter";

export interface SymbolDef {
  id: SymbolId;
  kind: SymbolKind;
  /** Match-count to multiplier-of-bet payouts (only 3/4/5 used). */
  pays?: { 3: number; 4: number; 5: number };
}

/** A cell on the grid. Wilds carry their per-spin multiplier. */
export interface Cell {
  symbol: SymbolId;
  /** Wild multiplier (2/3/5). Undefined for non-wilds. */
  multiplier?: number;
}

export type Grid = Cell[][]; // grid[reel][row], reel 0..4, row 0..2

export interface WaysWin {
  symbol: SymbolId;
  matchCount: number;           // 3, 4 or 5
  symbolPay: number;            // base multiplier from paytable
  waysCount: number;            // product over reels of matching positions
  /** Sum of per-way wild multipliers after the per-way cap is applied. */
  waysMultiplierProduct: number;
  /** Payout before spinMultiplier, after the per-way wild cap is applied. */
  baseAmount: number;
  amount: number;               // after spinMultiplier applied
}

export interface CascadeStep {
  index: number;
  gridBefore: Grid;
  wins: WaysWin[];
  cascadeWin: number; // sum of wins[].amount
  removedPositions: Array<{ reel: number; row: number }>;
  gridAfter: Grid;    // grid after removal+gravity+refill
}

export interface SpinResultBase {
  initialGrid: Grid;
  cascades: CascadeStep[];
  cascadeWin: number;     // sum of all cascade wins (no scatter, no FS)
  scatterCount: number;
  scatterPay: number;
  freeSpinsTriggered: boolean;
  /** True if this spin hit the 10,000× per-spin cap and stopped early. */
  capped: boolean;
}

export interface FreeSpinStep {
  index: number;             // 1-based spin index within FS session
  multiplierStep: number;    // 1,2,3,5,10
  result: SpinResultBase;    // grid + cascades for this FS spin
  retrigger: boolean;
  spinWin: number;           // total of cascadeWin (× spinMultiplier already inside cascades)
}

export interface FreeSpinSession {
  totalSpins: number;        // 10 + 5*retriggers (max 35, see config.maxRetriggers)
  retriggerCount: number;    // number of retriggers awarded (0..maxRetriggers)
  spins: FreeSpinStep[];
  totalWin: number;          // sum of per-spin wins; uncapped at session level
}

export interface SpinResult {
  bet: number;
  base: SpinResultBase;
  freeSpins?: FreeSpinSession;
  totalWin: number;          // sum of per-spin wins (each capped at maxWinX*bet)
  capped: boolean;           // true if any spin in the round hit the per-spin cap
}
