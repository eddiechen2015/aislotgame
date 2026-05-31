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
  if (!Number.isFinite(bet) || bet < BET.min || bet > BET.max) {
    throw new Error(`Bet ${bet} out of range [${BET.min}, ${BET.max}]`);
  }

  const base = runSpin(bet, rng, { spinMultiplier: 1, paysScatter: true });

  // Per-spin cap covers the base spin's total win (cascades + scatter pay).
  // Compare in integer cents to avoid floating-point precision issues.
  const perSpinCap = EXPOSURE.maxWinX * bet;
  const perSpinCapCents = Math.round(perSpinCap * 100);
  let baseSpinWin = base.cascadeWin + base.scatterPay;
  const baseSpinWinCents = Math.round(baseSpinWin * 100);
  let capped = base.capped;
  if (baseSpinWinCents >= perSpinCapCents) {
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
