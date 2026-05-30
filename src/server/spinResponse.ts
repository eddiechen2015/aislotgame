import { SpinResult } from "../engine/spinEngine";
import { Market } from "../gameMarkets";
import { centsToAmount } from "./money";
import { settleSpinResultDetailed } from "../settlement/settleSpin";

export interface SpinResponse {
  roundId?: string;
  balance: number;
  bet: number;
  totalWin: number;
  capped: boolean;
  absoluteCapped?: boolean;
  market?: Market;
  base: {
    initialGrid: SpinResult["base"]["initialGrid"];
    cascades: Array<{
      index: number;
      wins: SpinResult["base"]["cascades"][number]["wins"];
      cascadeWin: number;
      removed: SpinResult["base"]["cascades"][number]["removedPositions"];
      gridAfter: SpinResult["base"]["cascades"][number]["gridAfter"];
    }>;
    cascadeWin: number;
    scatterCount: number;
    scatterPay: number;
    freeSpinsTriggered: boolean;
  };
  freeSpins: {
    totalSpins: number;
    retriggerCount: number;
    totalWin: number;
    spins: Array<{
      index: number;
      multiplierStep: number;
      retrigger: boolean;
      spinWin: number;
      initialGrid: SpinResult["base"]["initialGrid"];
      cascades: Array<{
        index: number;
        wins: SpinResult["base"]["cascades"][number]["wins"];
        cascadeWin: number;
        removed: SpinResult["base"]["cascades"][number]["removedPositions"];
        gridAfter: SpinResult["base"]["cascades"][number]["gridAfter"];
      }>;
      cascadeWin: number;
      scatterCount: number;
    }>;
  } | null;
}

export function buildSpinResponse(
  settled: ReturnType<typeof settleSpinResultDetailed>["settled"],
  balanceCents: number,
  market: Market,
): SpinResponse {
  return {
    balance: centsToAmount(balanceCents),
    ...settled,
    base: {
      ...settled.base,
      cascades: settled.base.cascades.map((cascade) => ({
        index: cascade.index,
        wins: cascade.wins,
        cascadeWin: cascade.cascadeWin,
        removed: cascade.removedPositions,
        gridAfter: cascade.gridAfter,
      })),
    },
    freeSpins: settled.freeSpins
      ? {
          ...settled.freeSpins,
          spins: settled.freeSpins.spins.map((spin) => ({
            ...spin,
            cascades: spin.cascades.map((cascade) => ({
              index: cascade.index,
              wins: cascade.wins,
              cascadeWin: cascade.cascadeWin,
              removed: cascade.removedPositions,
              gridAfter: cascade.gridAfter,
            })),
          })),
        }
      : null,
  };
}

export { settleSpinResultDetailed };
