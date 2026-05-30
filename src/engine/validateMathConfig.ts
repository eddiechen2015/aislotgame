import { RuntimeMathConfig } from "./mathRuntime";
import { COLS } from "./config";
import { SymbolId } from "./types";

function totalCount(counts: Record<SymbolId, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function assertPositiveCounts(
  label: string,
  reels: Array<Record<SymbolId, number>>,
): void {
  if (reels.length !== COLS) {
    throw new Error(`${label} must have exactly ${COLS} reels`);
  }
  reels.forEach((counts, reel) => {
    for (const [symbol, value] of Object.entries(counts)) {
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${label}[${reel}].${symbol} must be a non-negative integer`);
      }
    }
    if (totalCount(counts as Record<SymbolId, number>) <= 0) {
      throw new Error(`${label}[${reel}] must contain at least one symbol`);
    }
  });
}

function assertStripOrders(
  label: string,
  orders: SymbolId[][],
): void {
  if (orders.length !== COLS) {
    throw new Error(`${label} must have exactly ${COLS} reel orders`);
  }
  orders.forEach((order, reel) => {
    if (order.length === 0) throw new Error(`${label}[${reel}] must not be empty`);
  });
}

function assertPaytables(symbols: RuntimeMathConfig["baseSymbols"], label: string): void {
  for (const [key, def] of Object.entries(symbols)) {
    if (!def.pays) continue;
    for (const count of [3, 4, 5] as const) {
      const value = def.pays[count];
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label}.${key}.pays.${count} must be a non-negative number`);
      }
    }
  }
}

export function validateRuntimeMathConfig(config: RuntimeMathConfig): void {
  assertPaytables(config.baseSymbols, "baseSymbols");
  assertPaytables(config.freeSpinSymbols, "freeSpinSymbols");
  assertPositiveCounts("baseReelSymbolCounts", config.baseReelSymbolCounts);
  assertPositiveCounts("freeSpinReelSymbolCounts", config.freeSpinReelSymbolCounts);
  assertStripOrders("baseReelStripOrders", config.baseReelStripOrders);
  assertStripOrders("freeSpinReelStripOrders", config.freeSpinReelStripOrders);
}
