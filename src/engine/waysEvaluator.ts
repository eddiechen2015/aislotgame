/**
 * 243-ways evaluator.
 *
 * Math (matches math.md §3 + §5):
 *   - For a payable symbol S, find the longest consecutive left-to-right
 *     prefix of reels (starting at reel 1) where S or WILD appears in
 *     at least one row.
 *   - waysCount = product over those reels of (#rows containing S or WILD).
 *   - wild_only_win = false: at least one reel in the prefix must contain
 *     a non-wild matching position. Spec says "winning combination requires
 *     at least one non-Wild symbol to anchor it" — we require ≥1 anchoring
 *     non-Wild position somewhere in the matched prefix.
 *   - Wild multipliers stack by multiplication within a way and are capped
 *     per way at EXPOSURE.maxMultiplierCap BEFORE the free-spin multiplier
 *     is applied (math.md §5 operation_order).
 *   - To preserve exact per-way cap semantics without enumerating every way,
 *     we run a small DP over reels. State = capped wild multiplier reached so
 *     far; value = number of ways that reach that state. Since the cap is 100x
 *     and reel multipliers are positive, capping during DP is exact.
 *   - highest_match_only: per symbol we pay only the highest reel-length match.
 *
 * Returns all winning positions for cascade removal.
 */
import { Grid, WaysWin } from "./types";
import {
  COLS, MIN_MATCH, TOTAL_WAYS, EXPOSURE,
} from "./config";
import { getRuntimeMathConfig } from "./mathRuntime";
import { ReelSetKind } from "./reel";

export interface EvaluationResult {
  wins: WaysWin[];
  /** Total payout (sum of wins[].baseAmount) before spin multiplier. */
  totalBaseAmount: number;
  /** Total payout after spin multiplier. */
  totalAmount: number;
  /** Positions of all winning symbols + the wilds that helped them.
   *  Used by the cascade engine to remove cells. */
  winningPositions: Array<{ reel: number; row: number }>;
}

function aggregateCappedWayMultipliers(
  perReelMultipliers: number[][],
  cap: number,
): number {
  let states = new Map<number, number>([[1, 1]]);

  for (const reelMultipliers of perReelMultipliers) {
    const nextStates = new Map<number, number>();
    for (const [productSoFar, waysSoFar] of states) {
      for (const mult of reelMultipliers) {
        const nextProduct = Math.min(productSoFar * mult, cap);
        nextStates.set(nextProduct, (nextStates.get(nextProduct) ?? 0) + waysSoFar);
      }
    }
    states = nextStates;
  }

  let total = 0;
  for (const [cappedMultiplier, ways] of states) {
    total += cappedMultiplier * ways;
  }
  return total;
}

/**
 * Evaluate the grid for a given total bet.
 * @param spinMultiplier per-spin multiplier (1 in base game, 1/2/3/5/10 in free spins).
 */
export function evaluateWays(
  grid: Grid,
  totalBet: number,
  spinMultiplier = 1,
  reelSetKind: ReelSetKind = "base",
): EvaluationResult {
  const betPerWay = totalBet / TOTAL_WAYS;
  const wins: WaysWin[] = [];
  const winPosSet = new Set<string>();
  const addPos = (reel: number, row: number) => winPosSet.add(`${reel}:${row}`);
  const { payableSymbols, baseSymbols, freeSpinSymbols } = getRuntimeMathConfig();
  const symbols = reelSetKind === "free_spins" ? freeSpinSymbols : baseSymbols;

  for (const sym of payableSymbols) {
    const symbolDef = symbols[sym];
    if (!symbolDef.pays) continue;

    // Per-reel data for this symbol.
    const matchingRowsPerReel: number[][] = []; // rows on each reel that match
    const wildRowsPerReel: number[][] = [];     // wild rows on each reel
    const multipliersPerReel: number[][] = [];  // one entry per matching position on the reel
    const countPerReel: number[] = [];          // total matching positions per reel

    let prefixLen = 0;
    let hasNonWildAnchor = false;

    for (let r = 0; r < COLS; r++) {
      const col = grid[r];
      const matchingRows: number[] = [];
      const wildRows: number[] = [];
      const multipliers: number[] = [];
      let count = 0;
      let nonWildHere = false;
      for (let y = 0; y < col.length; y++) {
        const cell = col[y];
        if (cell.symbol === sym) {
          matchingRows.push(y);
          multipliers.push(1);
          count += 1;
          nonWildHere = true;
        } else if (cell.symbol === "WILD") {
          wildRows.push(y);
          multipliers.push(cell.multiplier ?? 1);
          count += 1;
        }
      }
      if (count === 0) break;
      matchingRowsPerReel.push(matchingRows);
      wildRowsPerReel.push(wildRows);
      multipliersPerReel.push(multipliers);
      countPerReel.push(count);
      if (nonWildHere) hasNonWildAnchor = true;
      prefixLen++;
    }

    if (prefixLen < MIN_MATCH) continue;
    if (!hasNonWildAnchor) continue; // wild-only win disallowed

    // highest_match_only: pay only the longest qualifying match.
    const matchCount = prefixLen;
    let waysCount = 1;
    for (let r = 0; r < matchCount; r++) {
      waysCount *= countPerReel[r];
    }

    const cappedWayMultiplierTotal = aggregateCappedWayMultipliers(
      multipliersPerReel.slice(0, matchCount),
      EXPOSURE.maxMultiplierCap,
    );
    const symbolPay = (symbolDef.pays as any)[matchCount] as number;
    const baseAmount = symbolPay * cappedWayMultiplierTotal * betPerWay;
    const amount = baseAmount * spinMultiplier;

    wins.push({
      symbol: sym,
      matchCount,
      symbolPay,
      waysCount,
      waysMultiplierProduct: cappedWayMultiplierTotal,
      baseAmount,
      amount,
    });

    // Record winning positions for cascade removal.
    for (let r = 0; r < matchCount; r++) {
      for (const y of matchingRowsPerReel[r]) addPos(r, y);
      for (const y of wildRowsPerReel[r]) addPos(r, y);
    }
  }

  let totalBaseAmount = 0;
  let totalAmount = 0;
  for (const w of wins) {
    totalBaseAmount += w.baseAmount;
    totalAmount += w.amount;
  }

  const winningPositions = [...winPosSet].map((s) => {
    const [r, y] = s.split(":").map(Number);
    return { reel: r, row: y };
  });

  return { wins, totalBaseAmount, totalAmount, winningPositions };
}

/** Count scatters anywhere on the grid. */
export function countScatters(grid: Grid): number {
  let n = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let y = 0; y < grid[r].length; y++) {
      if (grid[r][y].symbol === "SCATTER") n++;
    }
  }
  return n;
}
