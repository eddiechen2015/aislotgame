/**
 * Free spin state machine.
 *
 * Per math.md §7:
 *   - Triggered by 3+ scatters in base spin.
 *   - 10 initial spins, +5 per retrigger.
 *   - Retrigger cap: max 5 retriggers per session (35 total spins). After the
 *     cap is reached, further scatters during free spins are ignored — no
 *     additional spins are awarded (`retrigger_cap_behavior: ignore_scatter_after_cap`).
 *   - Multiplier steps [1,2,3,5,10] — advance per spin, not per cascade.
 *   - After step 5, multiplier stays at 10x for all remaining spins.
 *   - Multiplier does NOT reset on retrigger. Resets to step 1 only at exit
 *     (i.e. next FS session restarts from step 1).
 *   - Scatter pay does NOT apply during free spins; additional 3+ scatters
 *     during a FS spin grant a retrigger only.
 *   - Reel weights are same as base game.
 *   - The 10,000× win cap is enforced per-spin inside runSpin (math.md §11).
 */
import { FreeSpinSession, FreeSpinStep } from "./types";
import { FREE_SPINS } from "./config";
import { RNG } from "./rng";
import { runSpin } from "./cascade";

export function runFreeSpins(totalBet: number, rng: RNG): FreeSpinSession {
  const spins: FreeSpinStep[] = [];
  let remaining = FREE_SPINS.initialSpins;
  let played = 0;
  let totalWin = 0;
  let retriggerCount = 0;

  while (remaining > 0) {
    played += 1;
    remaining -= 1;
    // Multiplier step is clamped at the last entry of the steps array.
    const stepIdx = Math.min(played - 1, FREE_SPINS.multiplierSteps.length - 1);
    const multiplierStep = FREE_SPINS.multiplierSteps[stepIdx];

    const result = runSpin(totalBet, rng, {
      spinMultiplier: multiplierStep,
      paysScatter: false,
      reelSetKind: "free_spins",
    });

    // Retrigger only fires while under the cap. Scatters landing after the cap
    // is reached are ignored (no extra spins, no scatter payout).
    let retrigger = false;
    if (result.freeSpinsTriggered && retriggerCount < FREE_SPINS.maxRetriggers) {
      retrigger = true;
      retriggerCount += 1;
      remaining += FREE_SPINS.retriggerSpins;
    }

    const spinWin = result.cascadeWin; // scatter pay disabled in FS
    totalWin += spinWin;

    spins.push({
      index: played,
      multiplierStep,
      result,
      retrigger,
      spinWin,
    });
  }

  return {
    totalSpins: played,
    retriggerCount,
    spins,
    totalWin,
  };
}
