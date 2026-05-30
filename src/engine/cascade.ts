/**
 * Cascade + spin orchestration.
 *
 * Per math.md §9:
 *   - Winning symbols (and the wilds that helped them) are removed.
 *   - Gravity: remaining symbols above fall down to fill removed positions.
 *   - Refill: new weighted-RNG symbols are generated for the empty top cells.
 *   - Wilds NOT part of a win remain on the grid (handled implicitly — we
 *     only remove cells whose positions are in winningPositions).
 *   - Cascade repeats until no win, or 20-cascade cap is reached.
 *   - In free spins, the per-spin multiplier applies to ALL cascade wins.
 *
 * Per math.md §11 (max_win_enforcement):
 *   - Scope is the TOTAL WIN of a single spin (all cascades + spin multiplier).
 *   - Enforcement is `early_stop`: once accumulated cascade win reaches the
 *     10,000× total-bet cap, the spin terminates immediately — no further
 *     cascades are evaluated and the payout is the accumulated amount at stop.
 *   - The cap applies per-spin in BOTH base game and free spins
 *     (`free_spin_session_cap: per_spin_only`).
 */
import { Cell, Grid, SpinResultBase, CascadeStep } from "./types";
import { COLS, ROWS, EXPOSURE, SCATTER } from "./config";
import { getRuntimeMathConfig } from "./mathRuntime";
import { RNG } from "./rng";
import { ReelSetKind, enforceMaxWilds, generateGrid, generateRefillCells } from "./reel";
import { countScatters, evaluateWays } from "./waysEvaluator";

/** Deep clone a grid (cell references duplicated). */
function cloneGrid(grid: Grid): Grid {
  return grid.map((col) => col.map((cell) => ({ ...cell })));
}

/** Remove winning positions, apply gravity, refill from top, then re-apply the wild cap. */
export function applyCascade(
  grid: Grid,
  winningPositions: Array<{ reel: number; row: number }>,
  rng: RNG,
  reelSetKind: ReelSetKind = "base",
): Grid {
  const removeByReel: Set<number>[] = Array.from({ length: COLS }, () => new Set<number>());
  for (const p of winningPositions) removeByReel[p.reel].add(p.row);

  const next: Grid = [];
  const refillPositions: Array<{ reel: number; row: number }> = [];
  for (let r = 0; r < COLS; r++) {
    const col = grid[r];
    // Keep cells whose row is NOT in remove set, preserving their order.
    const survivors: Cell[] = [];
    for (let y = 0; y < col.length; y++) {
      if (!removeByReel[r].has(y)) survivors.push({ ...col[y] });
    }
    const needed = ROWS - survivors.length;
    // Gravity = top-down indexing: new cells appear at the TOP (rows 0..needed-1),
    // survivors slide down to fill the bottom.
    const refilled = needed > 0 ? generateRefillCells(r, needed, rng, reelSetKind) : [];
    for (let y = 0; y < refilled.length; y++) refillPositions.push({ reel: r, row: y });
    next.push([...refilled, ...survivors]);
  }
  enforceMaxWilds(next, rng, reelSetKind, refillPositions);
  return next;
}

/**
 * Run one full spin (initial grid + cascade chain) at the given spin multiplier.
 * Scatter pay is computed only if `paysScatter` is true (base game).
 */
export function runSpin(
  totalBet: number,
  rng: RNG,
  opts: { spinMultiplier?: number; paysScatter?: boolean; reelSetKind?: ReelSetKind } = {},
): SpinResultBase {
  const spinMultiplier = opts.spinMultiplier ?? 1;
  const paysScatter = opts.paysScatter ?? true;
  const reelSetKind = opts.reelSetKind ?? "base";

  const initialGrid = generateGrid(rng, reelSetKind);
  const cascades: CascadeStep[] = [];
  let grid = initialGrid;
  let cascadeWin = 0;
  let capped = false;

  // Per-spin hard cap on total win (math.md §11). Early-stop enforcement.
  const winCap = EXPOSURE.maxWinX * totalBet;

  for (let i = 0; i < EXPOSURE.maxCascadesPerSpin; i++) {
    const evalResult = evaluateWays(grid, totalBet, spinMultiplier, reelSetKind);
    if (evalResult.wins.length === 0) break;

    const gridBefore = cloneGrid(grid);
    const gridAfter = applyCascade(grid, evalResult.winningPositions, rng, reelSetKind);
    cascades.push({
      index: i,
      gridBefore,
      wins: evalResult.wins,
      cascadeWin: evalResult.totalAmount,
      removedPositions: evalResult.winningPositions,
      gridAfter,
    });
    cascadeWin += evalResult.totalAmount;
    grid = gridAfter;

    // Early stop: once the accumulated win reaches the cap, terminate the spin
    // immediately. Pay exactly the cap; no further cascades are evaluated.
    if (cascadeWin >= winCap) {
      cascadeWin = winCap;
      capped = true;
      break;
    }
  }

  // Determine final scatter count.
  // Per math.md §6 mid_cascade_trigger: scatter count is total scatters visible
  // when the cascade sequence ends. We evaluate scatters on the LAST grid that
  // was actually displayed — i.e. either initialGrid (no cascades), or the
  // gridAfter of the last cascade step that produced wins. But scatters
  // accumulating during cascade should also be counted on intermediate steps.
  //
  // Simplest faithful interpretation: union of scatter positions across all
  // grids in the cascade sequence (since scatters that land during cascade
  // count, even if they later got pushed off — though they can't be pushed
  // off because scatters don't take part in wins, so they only ever stay or
  // get covered by gravity from above). To stay safe, count the MAX scatter
  // count observed across initialGrid + every gridAfter.
  let scatterCount = countScatters(initialGrid);
  for (const step of cascades) {
    const c = countScatters(step.gridAfter);
    if (c > scatterCount) scatterCount = c;
  }

  let scatterPay = 0;
  let freeSpinsTriggered = false;
  if (scatterCount >= SCATTER.triggerCount) {
    freeSpinsTriggered = true;
    if (paysScatter) {
      const capped = Math.min(scatterCount, 5);
      const mult = getRuntimeMathConfig().baseScatterPayoutXBet[capped] ?? 0;
      scatterPay = mult * totalBet;
    }
  }

  return {
    initialGrid,
    cascades,
    cascadeWin,
    scatterCount,
    scatterPay,
    freeSpinsTriggered,
    capped,
  };
}
