import { SymbolDef, SymbolId } from "./types";
import { buildDefaultRuntimeMathConfig } from "./mathProfile";
import { validateRuntimeMathConfig } from "./validateMathConfig";

export interface RuntimeMathConfig {
  baseSymbols: Record<SymbolId, SymbolDef>;
  freeSpinSymbols: Record<SymbolId, SymbolDef>;
  baseScatterPayoutXBet: Record<number, number>;
  baseReelSymbolCounts: Array<Record<SymbolId, number>>;
  baseReelStripOrders: SymbolId[][];
  freeSpinReelSymbolCounts: Array<Record<SymbolId, number>>;
  freeSpinReelStripOrders: SymbolId[][];
  payableSymbols: SymbolId[];
}

const defaultRuntimeMathConfig: RuntimeMathConfig = buildDefaultRuntimeMathConfig();

let runtimeMathConfig: RuntimeMathConfig = defaultRuntimeMathConfig;
let runtimeMathConfigVersion = 0;

export function getRuntimeMathConfig(): RuntimeMathConfig {
  return runtimeMathConfig;
}

export function getRuntimeMathConfigVersion(): number {
  return runtimeMathConfigVersion;
}

export function setRuntimeMathConfig(config: RuntimeMathConfig): void {
  validateRuntimeMathConfig(config);
  runtimeMathConfig = config;
  runtimeMathConfigVersion += 1;
}

export function resetRuntimeMathConfig(): void {
  runtimeMathConfig = defaultRuntimeMathConfig;
  runtimeMathConfigVersion += 1;
}

export async function withRuntimeMathConfig<T>(
  config: RuntimeMathConfig,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = runtimeMathConfig;
  const previousVersion = runtimeMathConfigVersion;
  setRuntimeMathConfig(config);
  try {
    return await fn();
  } finally {
    runtimeMathConfig = previous;
    runtimeMathConfigVersion = previousVersion + 1;
  }
}
