import { BET, EXPOSURE, FREE_SPINS, SCATTER, SYMBOLS } from "../engine/config";
import { getActiveMathProfileMetadata } from "../engine/mathProfileLoader";
import { getRuntimeMathConfig } from "../engine/mathRuntime";
import { ABSOLUTE_WIN_CAP, DEFAULT_MARKET, MARKETS } from "../gameMarkets";
import { SymbolId } from "../engine/types";

/**
 * Public config response — safe for client consumption.
 * Exposes game rules and symbol catalogue (needed for UI rendering) but
 * omits exact reel strip weights, symbol distribution counts, and numeric
 * payout multipliers. The client needs to know WHAT symbols exist and their
 * kind (for rendering), but not the probability math.
 */
export function buildConfigResponse() {
  const runtime = getRuntimeMathConfig();

  const symbolCatalogue = (Object.keys(runtime.baseSymbols) as SymbolId[]).map((id) => ({
    id,
    kind: runtime.baseSymbols[id].kind,
  }));

  return {
    game: { name: "Asian Tour", code: "ASIAN-TOUR-01", version: "0.1.0" },
    mathProfile: {
      profileId: getActiveMathProfileMetadata().profileId,
      profileVersion: getActiveMathProfileMetadata().profileVersion,
      status: getActiveMathProfileMetadata().status,
    },
    markets: {
      available: MARKETS,
      default: DEFAULT_MARKET,
      absoluteWinCap: ABSOLUTE_WIN_CAP,
    },
    bet: BET,
    grid: { rows: 3, cols: 5, totalWays: 243 },
    exposure: { maxWinX: EXPOSURE.maxWinX },
    scatter: { triggerCount: SCATTER.triggerCount },
    freeSpins: {
      initialSpins: FREE_SPINS.initialSpins,
      retriggerSpins: FREE_SPINS.retriggerSpins,
      multiplierSteps: FREE_SPINS.multiplierSteps,
      maxRetriggers: FREE_SPINS.maxRetriggers,
      maxTotalSpins: FREE_SPINS.maxTotalSpins,
    },
    symbols: symbolCatalogue,
  };
}

/**
 * Full config response including reel weights and paytables.
 * Only used by internal tools (simulator, test harness).
 * MUST NOT be exposed to public API endpoints.
 */
export function buildInternalConfigResponse() {
  const runtime = getRuntimeMathConfig();
  return {
    ...buildConfigResponse(),
    exposure: EXPOSURE,
    scatter: SCATTER,
    paytable: Object.values(runtime.baseSymbols)
      .filter((s) => s.pays)
      .map((s) => ({ id: s.id, kind: s.kind, pays: s.pays })),
    freeSpinPaytable: Object.values(runtime.freeSpinSymbols)
      .filter((s) => s.pays)
      .map((s) => ({ id: s.id, kind: s.kind, pays: s.pays })),
    baseReelSymbolCounts: runtime.baseReelSymbolCounts,
    freeSpinReelSymbolCounts: runtime.freeSpinReelSymbolCounts,
    reelWeights: runtime.baseReelSymbolCounts,
  };
}
