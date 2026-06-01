import type { RuntimeMathConfig } from "./mathRuntime";
import { COLS, SYMBOLS } from "./config";
import { SymbolId } from "./types";

const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[];
const SYMBOL_ID_SET = new Set<string>(SYMBOL_IDS);
const PAY_COUNTS = [3, 4, 5] as const;
const NON_PAYABLE_SYMBOLS = new Set<SymbolId>(["WILD", "SCATTER"]);
const SYMBOL_KINDS = new Set(["low", "premium", "wild", "scatter"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function isSymbolId(value: string): value is SymbolId {
  return SYMBOL_ID_SET.has(value);
}

function assertKnownKeys(record: Record<string, unknown>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!isSymbolId(key)) {
      throw new Error(`${label}.${key} is not a known symbol`);
    }
  }
}

function assertPaytable(value: unknown, label: string): void {
  const pays = assertRecord(value, label);
  for (const count of PAY_COUNTS) {
    const amount = pays[String(count)];
    if (!Number.isFinite(amount) || typeof amount !== "number" || amount < 0) {
      throw new Error(`${label}.${count} must be a non-negative number`);
    }
  }
}

function assertSymbolCatalogue(symbols: RuntimeMathConfig["baseSymbols"], label: string): void {
  const catalogue = assertRecord(symbols, label);
  assertKnownKeys(catalogue, label);

  for (const symbol of SYMBOL_IDS) {
    const def = assertRecord(catalogue[symbol], `${label}.${symbol}`);
    if (def.id !== symbol) {
      throw new Error(`${label}.${symbol}.id must equal ${symbol}`);
    }
    if (typeof def.kind !== "string" || !SYMBOL_KINDS.has(def.kind)) {
      throw new Error(`${label}.${symbol}.kind is invalid`);
    }
    if (def.kind !== SYMBOLS[symbol].kind) {
      throw new Error(`${label}.${symbol}.kind must equal ${SYMBOLS[symbol].kind}`);
    }
    if (def.pays !== undefined) {
      assertPaytable(def.pays, `${label}.${symbol}.pays`);
    }
  }
}

function totalCount(counts: Record<string, unknown>): number {
  return SYMBOL_IDS.reduce((sum, symbol) => sum + (counts[symbol] as number), 0);
}

function assertPositiveCounts(
  label: string,
  reels: Array<Record<SymbolId, number>>,
): void {
  if (!Array.isArray(reels) || reels.length !== COLS) {
    throw new Error(`${label} must have exactly ${COLS} reels`);
  }
  reels.forEach((counts, reel) => {
    const countRecord = assertRecord(counts, `${label}[${reel}]`);
    assertKnownKeys(countRecord, `${label}[${reel}]`);
    for (const symbol of SYMBOL_IDS) {
      const value = countRecord[symbol];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${label}[${reel}].${symbol} must be a non-negative integer`);
      }
    }
    if (totalCount(countRecord) <= 0) {
      throw new Error(`${label}[${reel}] must contain at least one symbol`);
    }
    if ((countRecord.WILD as number) > 0) {
      const hasFallbackSymbol = SYMBOL_IDS.some(
        (symbol) => !NON_PAYABLE_SYMBOLS.has(symbol) && (countRecord[symbol] as number) > 0,
      );
      if (!hasFallbackSymbol) {
        throw new Error(`${label}[${reel}] must include a non-special symbol when WILD count is positive`);
      }
    }
  });
}

function assertStripOrders(
  label: string,
  orders: SymbolId[][],
  countsLabel: string,
  countsByReel: Array<Record<SymbolId, number>>,
): void {
  if (!Array.isArray(orders) || orders.length !== COLS) {
    throw new Error(`${label} must have exactly ${COLS} reel orders`);
  }
  orders.forEach((order, reel) => {
    if (!Array.isArray(order)) throw new Error(`${label}[${reel}] must be an array`);
    if (order.length === 0) throw new Error(`${label}[${reel}] must not be empty`);
    for (const symbol of order) {
      if (typeof symbol !== "string" || !isSymbolId(symbol)) {
        throw new Error(`${label}[${reel}] contains unknown symbol ${String(symbol)}`);
      }
    }

    const orderedSymbols = new Set(order);
    const counts = countsByReel[reel] as Record<string, unknown>;
    for (const symbol of SYMBOL_IDS) {
      if ((counts[symbol] as number) > 0 && !orderedSymbols.has(symbol)) {
        throw new Error(`${label}[${reel}] must contain ${symbol} because ${countsLabel}[${reel}].${symbol} has positive count`);
      }
    }
  });
}

function assertScatterPayouts(payouts: RuntimeMathConfig["baseScatterPayoutXBet"]): void {
  const record = assertRecord(payouts, "baseScatterPayoutXBet");
  for (const count of PAY_COUNTS) {
    const value = record[String(count)];
    if (!Number.isFinite(value) || typeof value !== "number" || value < 0) {
      throw new Error(`baseScatterPayoutXBet.${count} must be a non-negative number`);
    }
  }
}

function assertPayableSymbols(config: RuntimeMathConfig): void {
  if (!Array.isArray(config.payableSymbols) || config.payableSymbols.length === 0) {
    throw new Error("payableSymbols must be a non-empty array");
  }

  const seen = new Set<SymbolId>();
  for (const symbol of config.payableSymbols) {
    if (typeof symbol !== "string" || !isSymbolId(symbol)) {
      throw new Error(`payableSymbols contains unknown symbol ${String(symbol)}`);
    }
    if (NON_PAYABLE_SYMBOLS.has(symbol)) {
      throw new Error(`payableSymbols cannot include ${symbol}`);
    }
    if (seen.has(symbol)) {
      throw new Error(`payableSymbols contains duplicate symbol ${symbol}`);
    }
    seen.add(symbol);

    if (!config.baseSymbols[symbol].pays) {
      throw new Error(`baseSymbols.${symbol}.pays is required because ${symbol} is payable`);
    }
    if (!config.freeSpinSymbols[symbol].pays) {
      throw new Error(`freeSpinSymbols.${symbol}.pays is required because ${symbol} is payable`);
    }
  }
}

export function validateRuntimeMathConfig(config: RuntimeMathConfig): void {
  assertRecord(config, "runtime math config");
  assertSymbolCatalogue(config.baseSymbols, "baseSymbols");
  assertSymbolCatalogue(config.freeSpinSymbols, "freeSpinSymbols");
  assertScatterPayouts(config.baseScatterPayoutXBet);
  assertPositiveCounts("baseReelSymbolCounts", config.baseReelSymbolCounts);
  assertPositiveCounts("freeSpinReelSymbolCounts", config.freeSpinReelSymbolCounts);
  assertStripOrders("baseReelStripOrders", config.baseReelStripOrders, "baseReelSymbolCounts", config.baseReelSymbolCounts);
  assertStripOrders("freeSpinReelStripOrders", config.freeSpinReelStripOrders, "freeSpinReelSymbolCounts", config.freeSpinReelSymbolCounts);
  assertPayableSymbols(config);
}
