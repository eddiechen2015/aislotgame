/**
 * RTP Monte Carlo simulator.
 *
 * Validates math.md §13 targets:
 *   - actual_rtp        — target 96.20% (±0.10 nominal)
 *   - hit_frequency     — target ~30%
 *   - free_spin_frequency
 *   - max_exposure      — observed largest spin × bet
 *   - volatility_index  — std dev of per-round return / bet
 *
 * Usage:
 *   npm run sim                 # default 1,000,000 spins
 *   npm run sim -- 100000000    # full 100M-spin run
 *   npm run sim -- 1000000 1.0 42   # spins, bet, seed
 *
 * The simulator runs entirely on the engine; no server is involved.
 */
import { playRound } from "../engine/spinEngine";
import { mulberry32, defaultRng, RNG } from "../engine/rng";
import { EXPOSURE } from "../engine/config";
import { getActiveMathProfileMetadata, loadMathProfileFromEnv } from "../engine/mathProfileLoader";
import { DEFAULT_MARKET, parseMarket } from "../gameMarkets";
import { settleSpinResult } from "../settlement/settleSpin";
import { centsToAmount, parseAmountToCents } from "../server/money";

interface Accum {
  spins: number;
  totalBet: number;
  totalWin: number;
  baseWin: number;          // base cascade wins
  scatterWin: number;       // scatter pay (base only)
  freeSpinWin: number;      // total free spin payouts
  hits: number;             // spins with totalWin > 0
  freeSpinTriggers: number; // base spins that triggered FS
  cappedSpins: number;
  maxWinX: number;          // largest single-round win in × bet
  sumWinX: number;          // for mean
  sumWinXSq: number;        // for variance
  winDistribution: Record<string, number>; // bucketed by × bet
}

function bucketKey(x: number): string {
  if (x === 0) return "0";
  if (x < 1) return "(0,1)";
  if (x < 5) return "[1,5)";
  if (x < 10) return "[5,10)";
  if (x < 25) return "[10,25)";
  if (x < 50) return "[25,50)";
  if (x < 100) return "[50,100)";
  if (x < 250) return "[100,250)";
  if (x < 500) return "[250,500)";
  if (x < 1000) return "[500,1000)";
  if (x < 5000) return "[1000,5000)";
  return "[5000,MAX]";
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(4) + "%";
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function simulate(spins: number, bet: number, rng: RNG, market: typeof DEFAULT_MARKET): Promise<Accum> {
  const acc: Accum = {
    spins: 0,
    totalBet: 0,
    totalWin: 0,
    baseWin: 0,
    scatterWin: 0,
    freeSpinWin: 0,
    hits: 0,
    freeSpinTriggers: 0,
    cappedSpins: 0,
    maxWinX: 0,
    sumWinX: 0,
    sumWinXSq: 0,
    winDistribution: {},
  };

  const reportEvery = Math.max(1, Math.floor(spins / 20));
  const start = Date.now();

  for (let i = 0; i < spins; i++) {
    const r = settleSpinResult(playRound(bet, rng), market);
    acc.spins += 1;
    acc.totalBet += r.bet;
    acc.totalWin += r.totalWin;
    acc.baseWin += r.base.cascadeWin;
    acc.scatterWin += r.base.scatterPay;
    if (r.freeSpins) {
      acc.freeSpinTriggers += 1;
      acc.freeSpinWin += r.freeSpins.totalWin;
    }
    if (r.totalWin > 0) acc.hits += 1;
    if (r.capped) acc.cappedSpins += 1;

    const winX = r.totalWin / r.bet;
    acc.sumWinX += winX;
    acc.sumWinXSq += winX * winX;
    if (winX > acc.maxWinX) acc.maxWinX = winX;

    const k = bucketKey(winX);
    acc.winDistribution[k] = (acc.winDistribution[k] ?? 0) + 1;

    if ((i + 1) % reportEvery === 0) {
      const pct = (((i + 1) / spins) * 100).toFixed(1);
      const elapsed = (Date.now() - start) / 1000;
      const rate = ((i + 1) / elapsed).toFixed(0);
      const partialRtp = acc.totalWin / acc.totalBet;
      process.stdout.write(
        `  progress ${pct}%  spins=${(i + 1).toLocaleString()}  ` +
        `rtp=${fmtPct(partialRtp)}  rate=${rate}/s\n`,
      );
    }
  }

  return acc;
}

function report(acc: Accum, bet: number): void {
  const rtp = acc.totalWin / acc.totalBet;
  const baseRtp = (acc.baseWin + acc.scatterWin) / acc.totalBet;
  const fsRtp = acc.freeSpinWin / acc.totalBet;
  const hitFreq = acc.hits / acc.spins;
  const fsFreq = acc.freeSpinTriggers / acc.spins;
  const meanX = acc.sumWinX / acc.spins;
  // 样本方差（Bessel 校正，除以 N-1）
  const varX = acc.spins > 1
    ? (acc.sumWinXSq - acc.spins * meanX * meanX) / (acc.spins - 1)
    : 0;
  const stdX = Math.sqrt(Math.max(0, varX));
  // Volatility index ≈ std dev of return / bet over a large sample.
  // Industry convention also uses a normalized form; here we report both.
  const volIndex = stdX;

  console.log("");
  console.log("==================== RESULTS ====================");
  console.log(`spins:                  ${fmtNum(acc.spins)}`);
  console.log(`bet:                    ${bet.toFixed(2)}`);
  console.log(`total bet:              ${fmtNum(acc.totalBet)}`);
  console.log(`total win:              ${fmtNum(acc.totalWin)}`);
  console.log("");
  console.log(`actual RTP:             ${fmtPct(rtp)}  (target 96.20%)`);
  console.log(`  base game RTP:        ${fmtPct(baseRtp)}  (target 58.0%, ±1.0%)`);
  console.log(`  free spins RTP:       ${fmtPct(fsRtp)}  (target 38.2%, ±1.0%)`);
  console.log("");
  console.log(`hit frequency:          ${fmtPct(hitFreq)}  (target ~30%)`);
  console.log(`free spin frequency:    ${fmtPct(fsFreq)}  (= 1 in ${(1 / fsFreq).toFixed(1)})`);
  console.log(`capped spins (10000x):  ${fmtNum(acc.cappedSpins)}`);
  console.log(`max win (× bet):        ${acc.maxWinX.toFixed(2)}x  (cap ${EXPOSURE.maxWinX}x)`);
  console.log("");
  console.log(`mean win (× bet):       ${meanX.toFixed(4)}`);
  console.log(`std dev (× bet):        ${stdX.toFixed(4)}`);
  console.log(`volatility index:       ${volIndex.toFixed(2)}`);
  console.log("");
  console.log("Win distribution (× bet):");
  const order = [
    "0", "(0,1)", "[1,5)", "[5,10)", "[10,25)", "[25,50)",
    "[50,100)", "[100,250)", "[250,500)", "[500,1000)",
    "[1000,5000)", "[5000,MAX]",
  ];
  for (const k of order) {
    const n = acc.winDistribution[k] ?? 0;
    const pct = (n / acc.spins) * 100;
    console.log(`  ${k.padEnd(14)} ${String(n).padStart(12)}  ${pct.toFixed(4)}%`);
  }
  console.log("=================================================");
}

async function main() {
  loadMathProfileFromEnv();
  const args = process.argv.slice(2);
  const spins = args[0] ? Number(args[0]) : 1_000_000;
  const betCents = parseAmountToCents(args[1] ?? 1.0);
  if (betCents === null) {
    throw new Error("bet must be a number with up to 2 decimals");
  }
  const bet = centsToAmount(betCents);
  const seed = args[2] ? Number(args[2]) : undefined;
  const market = parseMarket(args[3]) ?? DEFAULT_MARKET;
  const rng = seed !== undefined ? mulberry32(seed) : defaultRng();

  console.log("Asian Tour — RTP Monte Carlo");
  console.log("-----------------------------");
  console.log(`spins: ${fmtNum(spins)}   bet: ${bet}   seed: ${seed ?? "(Math.random)"}   market: ${market}`);
  const profile = getActiveMathProfileMetadata();
  console.log(`math profile: ${profile.profileId}@${profile.profileVersion} (${profile.status})`);
  console.log("");
  const t0 = Date.now();
  const acc = await simulate(spins, bet, rng, market);
  const dt = (Date.now() - t0) / 1000;
  console.log("");
  console.log(`Simulation finished in ${dt.toFixed(1)}s (${(spins / dt).toFixed(0)} spins/s)`);
  report(acc, bet);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
