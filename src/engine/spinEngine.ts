/**
 * Top-level spin orchestrator.
 *
 *   playRound(bet, rng) -> SpinResult
 *
 * Combines base spin + scatter pay + optional free-spin session.
 *
 * Per math.md §11, the 10,000× cap is applied PER SPIN (`free_spin_session_cap:
 * per_spin_only`) via early-stop inside runSpin. The round total is the sum of
 * the individually-capped spins and is NOT capped again at the session level.
 */
import { SpinResult } from "./types";
import { BET, EXPOSURE } from "./config";
import { RNG, defaultRng } from "./rng";
import { runSpin } from "./cascade";
import { runFreeSpins } from "./freeSpins";

export function playRound(bet: number, rng: RNG = defaultRng()): SpinResult {
  if (bet < BET.min || bet > BET.max) {
    throw new Error(`Bet ${bet} out of range [${BET.min}, ${BET.max}]`);
  }

  const base = runSpin(bet, rng, { spinMultiplier: 1, paysScatter: true });

  // Per-spin cap covers the base spin's total win (cascades + scatter pay).
  const perSpinCap = EXPOSURE.maxWinX * bet;
  let baseSpinWin = base.cascadeWin + base.scatterPay;
  let capped = base.capped;
  if (baseSpinWin > perSpinCap) {
    baseSpinWin = perSpinCap;
    capped = true;
  }

  let totalWin = baseSpinWin;
  let freeSpins;
  if (base.freeSpinsTriggered) {
    freeSpins = runFreeSpins(bet, rng);
    totalWin += freeSpins.totalWin;
    if (freeSpins.spins.some((s) => s.result.capped)) capped = true;
  }

  return { bet, base, freeSpins, totalWin, capped };
}

export * from "./types";
export * from "./config";
