import { BET, EXPOSURE, FREE_SPINS, SCATTER } from "../engine/config";
import { getActiveMathProfileMetadata } from "../engine/mathProfileLoader";
import { getRuntimeMathConfig } from "../engine/mathRuntime";
import { ABSOLUTE_WIN_CAP, DEFAULT_MARKET, MARKETS } from "../gameMarkets";

export function buildConfigResponse() {
  const runtime = getRuntimeMathConfig();
  return {
    game: { name: "Asian Tour", code: "ASIAN-TOUR-01", version: "0.1.0" },
    mathProfile: getActiveMathProfileMetadata(),
    markets: {
      available: MARKETS,
      default: DEFAULT_MARKET,
      absoluteWinCap: ABSOLUTE_WIN_CAP,
    },
    bet: BET,
    grid: { rows: 3, cols: 5, totalWays: 243 },
    exposure: EXPOSURE,
    scatter: SCATTER,
    freeSpins: {
      initialSpins: FREE_SPINS.initialSpins,
      retriggerSpins: FREE_SPINS.retriggerSpins,
      multiplierSteps: FREE_SPINS.multiplierSteps,
      maxRetriggers: FREE_SPINS.maxRetriggers,
      maxTotalSpins: FREE_SPINS.maxTotalSpins,
    },
    paytable: Object.values(runtime.baseSymbols)
      .filter((s) => s.pays)
      .map((s) => ({ id: s.id, kind: s.kind, pays: s.pays })),
    freeSpinPaytable: Object.values(runtime.freeSpinSymbols)
      .filter((s) => s.pays)
      .map((s) => ({ id: s.id, kind: s.kind, pays: s.pays })),
    baseReelSymbolCounts: runtime.baseReelSymbolCounts,
    freeSpinReelSymbolCounts: runtime.freeSpinReelSymbolCounts,
    // Compatibility alias for the original test page/API consumers.
    reelWeights: runtime.baseReelSymbolCounts,
  };
}
