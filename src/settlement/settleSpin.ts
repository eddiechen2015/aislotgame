import { SpinResult, SpinResultBase, WaysWin } from "../engine/spinEngine";
import { EXPOSURE } from "../engine/config";
import { ABSOLUTE_WIN_CAP_CENTS, Market } from "../gameMarkets";
import { amountToCents, centsToAmount } from "../server/money";

export interface AbsoluteCapAuditEvent {
  market: Market;
  scope: "base" | "free_spin";
  spinIndex?: number;
  requestedWin: number;
  paidWin: number;
  cap: number;
}

function sumSettledAmountCents(amounts: number[]): number {
  let cents = 0;
  for (const amount of amounts) cents += amountToCents(amount);
  return cents;
}

function settleWaysWin(win: WaysWin): WaysWin {
  return {
    ...win,
    amount: centsToAmount(amountToCents(win.amount)),
  };
}

function spinCapCentsForBet(bet: number, market: Market): number {
  const betCents = amountToCents(bet);
  return Math.min(betCents * EXPOSURE.maxWinX, ABSOLUTE_WIN_CAP_CENTS[market]);
}

function settleSpinBaseResult(
  result: SpinResultBase,
  bet: number,
  market: Market,
  scope: "base" | "free_spin",
  spinIndex?: number,
) {
  const capCents = spinCapCentsForBet(bet, market);
  let remainingCapCents = capCents;
  let requestedWinCents = 0;
  let absoluteCapped = false;
  const cascades = result.cascades.map((cascade) => {
    const wins = cascade.wins.map(settleWaysWin);
    let cascadeWinCents = 0;
    const cappedWins = wins.map((win) => {
      const requestedCents = amountToCents(win.amount);
      requestedWinCents += requestedCents;
      const paidCents = Math.min(requestedCents, remainingCapCents);
      if (paidCents < requestedCents) absoluteCapped = true;
      remainingCapCents -= paidCents;
      cascadeWinCents += paidCents;
      return { ...win, amount: centsToAmount(paidCents) };
    });
    return {
      index: cascade.index,
      wins: cappedWins,
      cascadeWin: centsToAmount(cascadeWinCents),
      cascadeWinCents,
      removedPositions: cascade.removedPositions,
      gridAfter: cascade.gridAfter,
    };
  });

  const cascadeWinCents = cascades.reduce((sum, cascade) => sum + cascade.cascadeWinCents, 0);
  const requestedScatterPayCents = amountToCents(result.scatterPay);
  requestedWinCents += requestedScatterPayCents;
  const scatterPayCents = Math.min(requestedScatterPayCents, remainingCapCents);
  if (scatterPayCents < requestedScatterPayCents) absoluteCapped = true;

  const paidWinCents = cascadeWinCents + scatterPayCents;
  const auditEvent = absoluteCapped
    ? {
        market,
        scope,
        spinIndex,
        requestedWin: requestedWinCents,
        paidWin: paidWinCents,
        cap: capCents,
      }
    : null;

  return {
    initialGrid: result.initialGrid,
    cascades,
    cascadeWin: centsToAmount(cascadeWinCents),
    cascadeWinCents,
    scatterCount: result.scatterCount,
    scatterPay: centsToAmount(scatterPayCents),
    scatterPayCents,
    freeSpinsTriggered: result.freeSpinsTriggered,
    absoluteCapped,
    auditEvent,
  };
}

export function settleSpinResultDetailed(result: SpinResult, market: Market) {
  const base = settleSpinBaseResult(result.base, result.bet, market, "base");
  const freeSpins = result.freeSpins
    ? (() => {
        const spins = result.freeSpins!.spins.map((spin) => {
          const settledBase = settleSpinBaseResult(
            spin.result,
            result.bet,
            market,
            "free_spin",
            spin.index,
          );
          return {
            index: spin.index,
            multiplierStep: spin.multiplierStep,
            retrigger: spin.retrigger,
            spinWin: settledBase.cascadeWin,
            spinWinCents: settledBase.cascadeWinCents,
            initialGrid: spin.result.initialGrid,
            cascades: settledBase.cascades.map(({ cascadeWinCents: _cascadeWinCents, ...cascade }) => cascade),
            cascadeWin: settledBase.cascadeWin,
            scatterCount: spin.result.scatterCount,
            absoluteCapped: settledBase.absoluteCapped,
            auditEvent: settledBase.auditEvent,
          };
        });

        const totalWinCents = spins.reduce((sum, spin) => sum + spin.spinWinCents, 0);

        return {
          totalSpins: result.freeSpins!.totalSpins,
          retriggerCount: result.freeSpins!.retriggerCount,
          totalWin: centsToAmount(totalWinCents),
          totalWinCents,
          absoluteCapped: spins.some((spin) => spin.absoluteCapped),
          auditEvents: spins.flatMap((spin) => spin.auditEvent ? [spin.auditEvent] : []),
          spins: spins.map(({ spinWinCents: _spinWinCents, ...spin }) => spin),
        };
      })()
    : null;

  const totalWinCents = base.cascadeWinCents + base.scatterPayCents + (freeSpins?.totalWinCents ?? 0);
  const absoluteCapped = base.absoluteCapped || !!freeSpins?.absoluteCapped;

  return {
    settled: {
      bet: result.bet,
      totalWin: centsToAmount(totalWinCents),
      capped: result.capped || absoluteCapped,
      base: {
        initialGrid: base.initialGrid,
        cascades: base.cascades.map(({ cascadeWinCents: _cascadeWinCents, ...cascade }) => cascade),
        cascadeWin: base.cascadeWin,
        scatterCount: base.scatterCount,
        scatterPay: base.scatterPay,
        freeSpinsTriggered: base.freeSpinsTriggered,
      },
      freeSpins: freeSpins
        ? {
            totalSpins: freeSpins.totalSpins,
            retriggerCount: freeSpins.retriggerCount,
            totalWin: freeSpins.totalWin,
            spins: freeSpins.spins,
          }
        : null,
    },
    absoluteCapped,
    auditEvents: [
      ...(base.auditEvent ? [base.auditEvent] : []),
      ...(freeSpins?.auditEvents ?? []),
    ],
  };
}

export function settleSpinResult(result: SpinResult, market: Market) {
  return settleSpinResultDetailed(result, market).settled;
}
