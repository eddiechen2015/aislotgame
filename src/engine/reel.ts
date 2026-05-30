/**
 * Reel symbol generation.
 *  - Deterministic reel strips with random stop positions and visible windows.
 *  - Each generated WILD is assigned a random multiplier (2/3/5).
 *  - Post-generation max-wild enforcement: if >5 WILDs across the grid,
 *    demote excess WILDs to the next-most-weighted non-special symbol on
 *    that reel (math.md §5: `max_wilds_enforcement: post_generation_demotion`).
 */
import { Cell, Grid, SymbolId } from "./types";
import {
  COLS, ROWS, WILD, EXPOSURE,
} from "./config";
import { getRuntimeMathConfig, getRuntimeMathConfigVersion } from "./mathRuntime";
import { RNG } from "./rng";

interface GridPosition {
  reel: number;
  row: number;
}

export type ReelSetKind = "base" | "free_spins";

interface ReelTable {
  strip: SymbolId[];
  /** Same as above but with WILD/SCATTER weights zeroed — used for demotion. */
  fallbackSymbols: SymbolId[];
  fallbackWeights: number[];
}

const SYMBOL_SPACING: Partial<Record<SymbolId, number>> = {
  SCATTER: 2,
  WILD: 1,
  SHOGUN: 1,
  PHOENIX: 1,
};

function buildReelStrip(
  counts: Record<SymbolId, number>,
  order: SymbolId[],
): SymbolId[] {
  const remaining = { ...counts };
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const strip: SymbolId[] = [];
  let cursor = 0;

  const canPlace = (sym: SymbolId): boolean => {
    if ((remaining[sym] ?? 0) <= 0) return false;
    const spacing = SYMBOL_SPACING[sym] ?? 0;
    for (let i = 1; i <= spacing; i++) {
      if (strip[strip.length - i] === sym) return false;
    }
    return true;
  };

  while (strip.length < total) {
    let placed = false;
    for (let i = 0; i < order.length; i++) {
      const sym = order[(cursor + i) % order.length];
      if (!canPlace(sym)) continue;
      strip.push(sym);
      remaining[sym] -= 1;
      cursor = (cursor + i + 1) % order.length;
      placed = true;
      break;
    }

    if (placed) continue;

    const fallback =
      order.find((sym) => (remaining[sym] ?? 0) > 0 && sym !== strip[strip.length - 1]) ??
      order.find((sym) => (remaining[sym] ?? 0) > 0);
    if (!fallback) break;
    strip.push(fallback);
    remaining[fallback] -= 1;
    cursor = (order.indexOf(fallback) + 1) % order.length;
  }

  return strip;
}

function getReelTables(kind: ReelSetKind): ReelTable[] {
  const version = getRuntimeMathConfigVersion();
  const cacheKey = `${version}:${kind}`;
  const cached = cachedReelTables.get(cacheKey);
  if (cached) return cached;

  const runtime = getRuntimeMathConfig();
  const reelSymbolCounts = kind === "free_spins"
    ? runtime.freeSpinReelSymbolCounts
    : runtime.baseReelSymbolCounts;
  const reelStripOrders = kind === "free_spins"
    ? runtime.freeSpinReelStripOrders
    : runtime.baseReelStripOrders;
  const tables = reelSymbolCounts.map((counts, reel) => {
    const fallbackSymbols: SymbolId[] = [];
    const fallbackWeights: number[] = [];
    (Object.keys(counts) as SymbolId[]).forEach((sym) => {
      const wt = counts[sym];
      if (wt > 0 && sym !== "WILD" && sym !== "SCATTER") {
        fallbackSymbols.push(sym);
        fallbackWeights.push(wt);
      }
    });

    return {
      strip: buildReelStrip(counts, reelStripOrders[reel]),
      fallbackSymbols,
      fallbackWeights,
    };
  });

  cachedReelTables.set(cacheKey, tables);
  return tables;
}

const cachedReelTables = new Map<string, ReelTable[]>();

function drawFromStrip(reel: number, offset: number, kind: ReelSetKind): SymbolId {
  const strip = getReelTables(kind)[reel].strip;
  return strip[offset % strip.length];
}

/** Draw a non-special symbol (used when demoting a wild). */
function drawFallback(reel: number, rng: RNG, kind: ReelSetKind): SymbolId {
  const t = getReelTables(kind)[reel];
  return t.fallbackSymbols[rng.pickWeighted(t.fallbackWeights)];
}

/** Assign a random wild multiplier (2 / 3 / 5, uniform). */
export function rollWildMultiplier(rng: RNG): number {
  return WILD.multiplierValues[rng.nextInt(WILD.multiplierValues.length)];
}

function createCell(symbol: SymbolId, rng: RNG): Cell {
  if (symbol === "WILD") return { symbol: "WILD", multiplier: rollWildMultiplier(rng) };
  return { symbol };
}

function drawStripWindow(reel: number, count: number, rng: RNG, kind: ReelSetKind): Cell[] {
  const strip = getReelTables(kind)[reel].strip;
  const start = rng.nextInt(strip.length);
  const out: Cell[] = [];
  for (let i = 0; i < count; i++) {
    out.push(createCell(drawFromStrip(reel, start + i, kind), rng));
  }
  return out;
}

function collectWildPositions(grid: Grid): GridPosition[] {
  const wildPositions: GridPosition[] = [];
  for (let r = 0; r < COLS; r++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[r][y].symbol === "WILD") wildPositions.push({ reel: r, row: y });
    }
  }
  return wildPositions;
}

function shufflePositions(positions: GridPosition[], rng: RNG): void {
  for (let i = positions.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
}

function demoteWildPositions(
  grid: Grid,
  positions: GridPosition[],
  count: number,
  rng: RNG,
  kind: ReelSetKind,
): number {
  const wildPositions = positions.filter(({ reel, row }) => grid[reel][row].symbol === "WILD");
  if (count <= 0 || wildPositions.length === 0) return 0;

  shufflePositions(wildPositions, rng);
  const demotions = Math.min(count, wildPositions.length);
  for (let i = 0; i < demotions; i++) {
    const { reel, row } = wildPositions[i];
    grid[reel][row] = { symbol: drawFallback(reel, rng, kind) };
  }
  return demotions;
}

/**
 * Enforce max-wilds-per-spin by demoting excess wilds on their own reel.
 * When `preferredDemotionPositions` is provided, those positions are demoted
 * first. Cascade refills use this to preserve surviving wilds and only demote
 * newly generated refill wilds unless the grid was already invalid.
 */
export function enforceMaxWilds(
  grid: Grid,
  rng: RNG,
  kind: ReelSetKind,
  preferredDemotionPositions: GridPosition[] = [],
): void {
  let excess = collectWildPositions(grid).length - EXPOSURE.maxWildsPerSpin;
  if (excess <= 0) return;

  excess -= demoteWildPositions(grid, preferredDemotionPositions, excess, rng, kind);
  if (excess <= 0) return;

  demoteWildPositions(grid, collectWildPositions(grid), excess, rng, kind);
}

/** Generate a fresh full grid. */
export function generateGrid(rng: RNG, kind: ReelSetKind = "base"): Grid {
  const grid: Grid = [];
  for (let r = 0; r < COLS; r++) {
    grid.push(drawStripWindow(r, ROWS, rng, kind));
  }
  enforceMaxWilds(grid, rng, kind);
  return grid;
}

/** Generate `count` new cells for a specific reel (used during cascade refill). */
export function generateRefillCells(reel: number, count: number, rng: RNG, kind: ReelSetKind = "base"): Cell[] {
  return drawStripWindow(reel, count, rng, kind);
}
