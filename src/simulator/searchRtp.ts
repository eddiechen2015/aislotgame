import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import {
  FREE_SPIN_REEL_STRIP_ORDERS,
  FREE_SPIN_REEL_SYMBOL_COUNTS,
  FREE_SPIN_SYMBOLS,
  PAYABLE_SYMBOLS,
  REEL_STRIP_ORDERS,
  REEL_SYMBOL_COUNTS,
  SCATTER,
  SYMBOLS,
} from "../engine/config";
import { buildMathProfileDocument, DEFAULT_MATH_PROFILE_TARGETS } from "../engine/mathProfile";
import type { MathProfileTargets, MetricTarget } from "../engine/mathProfile";
import { RuntimeMathConfig, withRuntimeMathConfig } from "../engine/mathRuntime";
import { mulberry32 } from "../engine/rng";
import { playRound } from "../engine/spinEngine";
import { SymbolDef, SymbolId } from "../engine/types";
import { DEFAULT_MARKET, Market } from "../gameMarkets";
import { settleSpinResult } from "../settlement/settleSpin";

type PayKey = Exclude<SymbolId, "WILD" | "SCATTER">;
type ScatterPayCount = 3 | 4 | 5;
type PayScaleMap = Record<PayKey, number>;
type ScatterScaleMap = Record<ScatterPayCount, number>;

interface Candidate {
  basePayScales: PayScaleMap;
  freeSpinPayScales: PayScaleMap;
  scatterScales: ScatterScaleMap;
  scatterOuterDelta: number;
  scatterInnerDelta: number;
  scatterCenterDelta: number;
  wildDelta: number;
  premiumDelta: number;
  freeSpinScatterOuterDelta: number;
  freeSpinScatterInnerDelta: number;
  freeSpinScatterCenterDelta: number;
  freeSpinWildDelta: number;
  freeSpinPremiumDelta: number;
}

interface CandidateStats {
  seed: number;
  rtp: number;
  baseRtp: number;
  fsRtp: number;
  hitFreq: number;
  fsFreq: number;
  maxWinX: number;
  stdDevX: number;
}

interface CandidateResult extends Omit<CandidateStats, "seed"> {
  candidate: Candidate;
  score: number;
  seedCount: number;
  stabilityPenalty: number;
  perSeed: CandidateStats[];
}

interface RaceRoundReport {
  label: string;
  round: number;
  spins: number;
  seeds: number[];
  evaluated: number;
  survivors: number;
  bestScore: number | null;
  top: CandidateResult[];
}

interface RaceResult {
  finalResults: CandidateResult[];
  rounds: RaceRoundReport[];
}

interface SearchWorkerData {
  mode: "evaluateCandidate";
  candidate: Candidate;
  spins: number;
  seeds: number[];
  market: Market;
}

type SearchWorkerMessage =
  | { ok: true; result: CandidateResult }
  | { ok: false; error: string };

const PAY_KEYS: PayKey[] = ["A", "K", "Q", "J", "10", "NINJA", "DRAGON", "PHOENIX", "SHOGUN"];
const SCATTER_PAY_COUNTS: ScatterPayCount[] = [3, 4, 5];
const PREMIUM_KEYS = new Set<PayKey>(["NINJA", "DRAGON", "PHOENIX", "SHOGUN"]);
const LOW_KEYS: PayKey[] = ["A", "K", "Q", "J", "10"];
const TARGETS: MathProfileTargets = DEFAULT_MATH_PROFILE_TARGETS;

const SCORE_WEIGHTS = {
  rtp: 3.0,
  baseRtp: 1.4,
  fsRtp: 1.4,
  hitFreq: 1.2,
  fsFreq: 1.5,
  stdDevX: 0.8,
  maxWinX: 25,
  stability: 0.2,
};

const BASE_SYMBOLS: Record<SymbolId, SymbolDef> = structuredClone(SYMBOLS);
const BASE_FREE_SPIN_SYMBOLS: Record<SymbolId, SymbolDef> = structuredClone(FREE_SPIN_SYMBOLS);
const BASE_SCATTER = { ...SCATTER.payoutXBet };
const BASE_REEL_COUNTS = REEL_SYMBOL_COUNTS.map((counts) => ({ ...counts }));
const BASE_FREE_SPIN_REEL_COUNTS = FREE_SPIN_REEL_SYMBOL_COUNTS.map((counts) => ({ ...counts }));

function clampCount(value: number, min: number): number {
  return Math.max(min, Math.round(value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rebalanceLowCounts(
  counts: Record<SymbolId, number>,
  targetTotal: number,
  referenceCounts: Record<SymbolId, number>,
): void {
  let currentTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);

  while (currentTotal > targetTotal) {
    const key = LOW_KEYS
      .filter((symbol) => counts[symbol] > 1)
      .sort((a, b) => counts[b] - counts[a])[0];
    if (!key) break;
    counts[key] -= 1;
    currentTotal -= 1;
  }

  while (currentTotal < targetTotal) {
    const key = LOW_KEYS
      .slice()
      .sort((a, b) => referenceCounts[b] - referenceCounts[a])[currentTotal % LOW_KEYS.length];
    counts[key] += 1;
    currentTotal += 1;
  }
}

function applyPayScales(
  symbols: Record<SymbolId, SymbolDef>,
  baseSymbols: Record<SymbolId, SymbolDef>,
  scales: PayScaleMap,
): void {
  for (const key of PAY_KEYS) {
    const pays = symbols[key].pays!;
    pays[3] = +(baseSymbols[key].pays![3] * scales[key]).toFixed(6);
    pays[4] = +(baseSymbols[key].pays![4] * scales[key]).toFixed(6);
    pays[5] = +(baseSymbols[key].pays![5] * scales[key]).toFixed(6);
  }
}

function buildCandidateConfig(candidate: Candidate): RuntimeMathConfig {
  const baseSymbols = structuredClone(BASE_SYMBOLS);
  applyPayScales(baseSymbols, BASE_SYMBOLS, candidate.basePayScales);

  const baseScatterPayoutXBet: Record<number, number> = {};
  for (const count of SCATTER_PAY_COUNTS) {
    baseScatterPayoutXBet[count] = +(BASE_SCATTER[count] * candidate.scatterScales[count]).toFixed(6);
  }

  const freeSpinSymbols = structuredClone(BASE_FREE_SPIN_SYMBOLS);
  applyPayScales(freeSpinSymbols, BASE_FREE_SPIN_SYMBOLS, candidate.freeSpinPayScales);

  const baseReelSymbolCounts = BASE_REEL_COUNTS.map((counts, reel) => {
    const next = { ...counts };
    const scatterBase = BASE_REEL_COUNTS[reel].SCATTER;
    const wildBase = BASE_REEL_COUNTS[reel].WILD;
    const scatterDelta = reel === 2
      ? candidate.scatterCenterDelta
      : (reel === 1 || reel === 3 ? candidate.scatterInnerDelta : candidate.scatterOuterDelta);
    next.SCATTER = clampCount(scatterBase + scatterDelta, 1);
    next.WILD = clampCount(wildBase + candidate.wildDelta, 1);
    for (const premium of PREMIUM_KEYS) {
      const base = BASE_REEL_COUNTS[reel][premium];
      next[premium] = clampCount(base + candidate.premiumDelta, 1);
    }
    const targetTotal = Object.values(BASE_REEL_COUNTS[reel]).reduce((sum, count) => sum + count, 0);
    rebalanceLowCounts(next, targetTotal, BASE_REEL_COUNTS[reel]);
    return next;
  });

  const freeSpinReelSymbolCounts = BASE_FREE_SPIN_REEL_COUNTS.map((counts, reel) => {
    const next = { ...counts };
    const scatterBase = BASE_FREE_SPIN_REEL_COUNTS[reel].SCATTER;
    const wildBase = BASE_FREE_SPIN_REEL_COUNTS[reel].WILD;
    const scatterDelta = reel === 2
      ? candidate.freeSpinScatterCenterDelta
      : (reel === 1 || reel === 3 ? candidate.freeSpinScatterInnerDelta : candidate.freeSpinScatterOuterDelta);
    next.SCATTER = clampCount(scatterBase + scatterDelta, 1);
    next.WILD = clampCount(wildBase + candidate.freeSpinWildDelta, 1);
    for (const premium of PREMIUM_KEYS) {
      const base = BASE_FREE_SPIN_REEL_COUNTS[reel][premium];
      next[premium] = clampCount(base + candidate.freeSpinPremiumDelta, 1);
    }
    const targetTotal = Object.values(BASE_FREE_SPIN_REEL_COUNTS[reel]).reduce((sum, count) => sum + count, 0);
    rebalanceLowCounts(next, targetTotal, BASE_FREE_SPIN_REEL_COUNTS[reel]);
    return next;
  });

  return {
    baseSymbols,
    freeSpinSymbols,
    baseScatterPayoutXBet,
    baseReelSymbolCounts,
    baseReelStripOrders: REEL_STRIP_ORDERS,
    freeSpinReelSymbolCounts,
    freeSpinReelStripOrders: FREE_SPIN_REEL_STRIP_ORDERS,
    payableSymbols: [...PAYABLE_SYMBOLS],
  };
}

function randomBetween(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randomIntBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(randomBetween(rng, min, max + 1));
}

function randomPayScales(
  rng: () => number,
  lowRange: [number, number],
  premiumRange: [number, number],
): PayScaleMap {
  const scales = {} as PayScaleMap;
  for (const key of PAY_KEYS) {
    const [min, max] = PREMIUM_KEYS.has(key) ? premiumRange : lowRange;
    scales[key] = +randomBetween(rng, min, max).toFixed(6);
  }
  return scales;
}

function perturbPayScales(
  rng: () => number,
  around: PayScaleMap,
  lowRange: [number, number],
  premiumRange: [number, number],
  radius: number,
): PayScaleMap {
  const scales = {} as PayScaleMap;
  for (const key of PAY_KEYS) {
    const [min, max] = PREMIUM_KEYS.has(key) ? premiumRange : lowRange;
    scales[key] = +clampNumber(around[key] + randomBetween(rng, -radius, radius), min, max).toFixed(6);
  }
  return scales;
}

function randomScatterScales(rng: () => number): ScatterScaleMap {
  return {
    3: +randomBetween(rng, 0.25, 1.25).toFixed(6),
    4: +randomBetween(rng, 0.25, 1.25).toFixed(6),
    5: +randomBetween(rng, 0.25, 1.25).toFixed(6),
  };
}

function perturbScatterScales(rng: () => number, around: ScatterScaleMap): ScatterScaleMap {
  return {
    3: +clampNumber(around[3] + randomBetween(rng, -0.16, 0.16), 0.05, 1.8).toFixed(6),
    4: +clampNumber(around[4] + randomBetween(rng, -0.16, 0.16), 0.05, 1.8).toFixed(6),
    5: +clampNumber(around[5] + randomBetween(rng, -0.16, 0.16), 0.05, 1.8).toFixed(6),
  };
}

function sampleCandidate(rng: () => number, around?: Candidate): Candidate {
  if (!around) {
    return {
      basePayScales: randomPayScales(rng, [0.25, 1.05], [0.55, 2.25]),
      freeSpinPayScales: randomPayScales(rng, [0.35, 2.2], [0.75, 3.6]),
      scatterScales: randomScatterScales(rng),
      scatterOuterDelta: randomIntBetween(rng, -7, 1),
      scatterInnerDelta: randomIntBetween(rng, -7, 1),
      scatterCenterDelta: randomIntBetween(rng, -9, 1),
      wildDelta: randomIntBetween(rng, 0, 5),
      premiumDelta: randomIntBetween(rng, -1, 5),
      freeSpinScatterOuterDelta: randomIntBetween(rng, -4, 5),
      freeSpinScatterInnerDelta: randomIntBetween(rng, -4, 6),
      freeSpinScatterCenterDelta: randomIntBetween(rng, -5, 7),
      freeSpinWildDelta: randomIntBetween(rng, 0, 6),
      freeSpinPremiumDelta: randomIntBetween(rng, -1, 6),
    };
  }

  return {
    basePayScales: perturbPayScales(rng, around.basePayScales, [0.15, 1.3], [0.35, 2.8], 0.14),
    freeSpinPayScales: perturbPayScales(rng, around.freeSpinPayScales, [0.2, 2.7], [0.45, 4.2], 0.22),
    scatterScales: perturbScatterScales(rng, around.scatterScales),
    scatterOuterDelta: around.scatterOuterDelta + randomIntBetween(rng, -1, 1),
    scatterInnerDelta: around.scatterInnerDelta + randomIntBetween(rng, -1, 1),
    scatterCenterDelta: around.scatterCenterDelta + randomIntBetween(rng, -1, 1),
    wildDelta: around.wildDelta + randomIntBetween(rng, -1, 1),
    premiumDelta: around.premiumDelta + randomIntBetween(rng, -1, 1),
    freeSpinScatterOuterDelta: around.freeSpinScatterOuterDelta + randomIntBetween(rng, -1, 1),
    freeSpinScatterInnerDelta: around.freeSpinScatterInnerDelta + randomIntBetween(rng, -1, 1),
    freeSpinScatterCenterDelta: around.freeSpinScatterCenterDelta + randomIntBetween(rng, -1, 1),
    freeSpinWildDelta: around.freeSpinWildDelta + randomIntBetween(rng, -1, 1),
    freeSpinPremiumDelta: around.freeSpinPremiumDelta + randomIntBetween(rng, -1, 1),
  };
}

function normalizedMetricError(actual: number, target: MetricTarget): number {
  return Math.abs(actual - target.target) / target.tolerance;
}

function normalizedUpperBoundError(actual: number, max: number): number {
  if (actual <= max) return 0;
  return (actual - max) / max;
}

function scoreCandidate(stats: Omit<CandidateStats, "seed">, perSeed: CandidateStats[]): { score: number; stabilityPenalty: number } {
  const stabilityPenalty = SCORE_WEIGHTS.stability * (
    sampleStdDev(perSeed.map((seedStats) => seedStats.rtp)) / TARGETS.rtp.tolerance +
    sampleStdDev(perSeed.map((seedStats) => seedStats.baseRtp)) / TARGETS.baseRtp.tolerance +
    sampleStdDev(perSeed.map((seedStats) => seedStats.fsRtp)) / TARGETS.fsRtp.tolerance +
    sampleStdDev(perSeed.map((seedStats) => seedStats.hitFreq)) / TARGETS.hitFreq.tolerance +
    sampleStdDev(perSeed.map((seedStats) => seedStats.fsFreq)) / TARGETS.fsFreq.tolerance
  );

  const score =
    SCORE_WEIGHTS.rtp * normalizedMetricError(stats.rtp, TARGETS.rtp) +
    SCORE_WEIGHTS.baseRtp * normalizedMetricError(stats.baseRtp, TARGETS.baseRtp) +
    SCORE_WEIGHTS.fsRtp * normalizedMetricError(stats.fsRtp, TARGETS.fsRtp) +
    SCORE_WEIGHTS.hitFreq * normalizedMetricError(stats.hitFreq, TARGETS.hitFreq) +
    SCORE_WEIGHTS.fsFreq * normalizedMetricError(stats.fsFreq, TARGETS.fsFreq) +
    SCORE_WEIGHTS.stdDevX * normalizedMetricError(stats.stdDevX, TARGETS.stdDevX) +
    SCORE_WEIGHTS.maxWinX * normalizedUpperBoundError(stats.maxWinX, TARGETS.maxWinX.max) +
    stabilityPenalty;

  return { score, stabilityPenalty };
}

async function evaluateCandidateSeed(
  spins: number,
  seed: number,
  market: Market,
): Promise<CandidateStats> {
  const rng = mulberry32(seed);
  let totalWin = 0;
  let baseWin = 0;
  let fsWin = 0;
  let hits = 0;
  let fsTriggers = 0;
  let maxWinX = 0;
  let sumWinX = 0;
  let sumWinXSquared = 0;

  for (let i = 0; i < spins; i++) {
    const result = settleSpinResult(playRound(1, rng), market);
    totalWin += result.totalWin;
    baseWin += result.base.cascadeWin + result.base.scatterPay;
    if (result.totalWin > 0) hits += 1;
    if (result.freeSpins) {
      fsTriggers += 1;
      fsWin += result.freeSpins.totalWin;
    }
    const winX = result.totalWin / result.bet;
    sumWinX += winX;
    sumWinXSquared += winX ** 2;
    if (winX > maxWinX) maxWinX = winX;
  }

  const rtp = totalWin / spins;
  const baseRtp = baseWin / spins;
  const fsRtp = fsWin / spins;
  const hitFreq = hits / spins;
  const fsFreq = fsTriggers / spins;
  const meanWinX = sumWinX / spins;
  const variance = Math.max(0, sumWinXSquared / spins - meanWinX ** 2);

  return {
    seed,
    rtp,
    baseRtp,
    fsRtp,
    hitFreq,
    fsFreq,
    maxWinX,
    stdDevX: Math.sqrt(variance),
  };
}

function aggregateStats(perSeed: CandidateStats[]): Omit<CandidateStats, "seed"> {
  return {
    rtp: mean(perSeed.map((stats) => stats.rtp)),
    baseRtp: mean(perSeed.map((stats) => stats.baseRtp)),
    fsRtp: mean(perSeed.map((stats) => stats.fsRtp)),
    hitFreq: mean(perSeed.map((stats) => stats.hitFreq)),
    fsFreq: mean(perSeed.map((stats) => stats.fsFreq)),
    maxWinX: Math.max(...perSeed.map((stats) => stats.maxWinX)),
    stdDevX: mean(perSeed.map((stats) => stats.stdDevX)),
  };
}

async function evaluateCandidate(
  candidate: Candidate,
  spins: number,
  seeds: number[],
  market: Market,
): Promise<CandidateResult> {
  const perSeed = await withRuntimeMathConfig(buildCandidateConfig(candidate), async () => {
    const seedResults: CandidateStats[] = [];
    for (const seed of seeds) {
      seedResults.push(await evaluateCandidateSeed(spins, seed, market));
    }
    return seedResults;
  });

  const stats = aggregateStats(perSeed);
  const { score, stabilityPenalty } = scoreCandidate(stats, perSeed);
  return {
    candidate,
    ...stats,
    score,
    seedCount: seeds.length,
    stabilityPenalty,
    perSeed,
  };
}

function stageSeedSet(baseSeed: number, seedCount: number, stageOffset: number): number[] {
  const first = baseSeed + stageOffset;
  return Array.from({ length: seedCount }, (_, index) => first + index * 101);
}

function workerExecArgv(): string[] {
  return __filename.endsWith(".ts") ? ["-r", "ts-node/register"] : [];
}

function defaultWorkerCount(envName: string, fallbackCap = 4): number {
  const envValue = Number(process.env[envName]);
  if (Number.isFinite(envValue) && envValue > 0) return Math.max(1, Math.floor(envValue));
  return Math.max(1, Math.min(fallbackCap, availableParallelism() - 1));
}

function parseWorkerCount(value: string | undefined, envName: string): number {
  const parsed = Number(value);
  if (value !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
    throw new Error("workerCount must be a positive number");
  }
  return value === undefined ? defaultWorkerCount(envName) : Math.floor(parsed);
}

function evaluateCandidateInWorker(
  candidate: Candidate,
  spins: number,
  seeds: number[],
  market: Market,
): Promise<CandidateResult> {
  const data: SearchWorkerData = { mode: "evaluateCandidate", candidate, spins, seeds, market };
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: data,
      execArgv: workerExecArgv(),
    });
    let settled = false;

    worker.once("message", (message: SearchWorkerMessage) => {
      settled = true;
      if (message.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }
    });
    worker.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`search worker exited with code ${code}`));
      }
    });
  });
}

async function evaluateCandidates(
  candidates: Candidate[],
  spins: number,
  seeds: number[],
  market: Market,
  workerCount: number,
): Promise<CandidateResult[]> {
  if (workerCount <= 1 || candidates.length <= 1) {
    const results: CandidateResult[] = [];
    for (const candidate of candidates) {
      results.push(await evaluateCandidate(candidate, spins, seeds, market));
    }
    return results;
  }

  const results = new Array<CandidateResult>(candidates.length);
  let nextIndex = 0;
  let active = 0;
  let completed = 0;

  return new Promise((resolve, reject) => {
    const launchNext = () => {
      while (active < workerCount && nextIndex < candidates.length) {
        const index = nextIndex;
        nextIndex += 1;
        active += 1;
        evaluateCandidateInWorker(candidates[index], spins, seeds, market)
          .then((result) => {
            results[index] = result;
            active -= 1;
            completed += 1;
            if (completed === candidates.length) {
              resolve(results);
              return;
            }
            launchNext();
          })
          .catch(reject);
      }
    };
    launchNext();
  });
}

function uniqueBudgets(maxSpins: number, fractions: number[]): number[] {
  const budgets = fractions.map((fraction) => Math.max(1, Math.round(maxSpins * fraction)));
  budgets.push(maxSpins);
  return [...new Set(budgets.filter((spins) => spins > 0))].sort((a, b) => a - b);
}

function survivorCount(total: number, fraction: number, minimum: number, maximum: number): number {
  if (total <= 0) return 0;
  return Math.min(total, maximum, Math.max(minimum, Math.ceil(total * fraction)));
}

async function raceCandidates(
  label: string,
  candidates: Candidate[],
  budgets: number[],
  seeds: number[],
  market: Market,
  options: {
    finalTop: number;
    minSurvivors: number;
    survivorFractions: number[];
    workerCount: number;
  },
): Promise<RaceResult> {
  let survivors = candidates;
  let finalResults: CandidateResult[] = [];
  const rounds: RaceRoundReport[] = [];

  for (let roundIndex = 0; roundIndex < budgets.length; roundIndex++) {
    if (survivors.length === 0) break;

    const spins = budgets[roundIndex];
    const results = await evaluateCandidates(survivors, spins, seeds, market, options.workerCount);
    results.sort((a, b) => a.score - b.score);
    const isFinalRound = roundIndex === budgets.length - 1;
    const keep = isFinalRound
      ? Math.min(options.finalTop, results.length)
      : survivorCount(
          results.length,
          options.survivorFractions[roundIndex] ?? 0.5,
          options.minSurvivors,
          results.length,
        );

    rounds.push({
      label,
      round: roundIndex + 1,
      spins,
      seeds,
      evaluated: results.length,
      survivors: keep,
      bestScore: results[0]?.score ?? null,
      top: results.slice(0, Math.min(5, keep)),
    });

    console.log(`${label} race round ${roundIndex + 1}/${budgets.length}: spins=${spins} evaluated=${results.length} survivors=${keep}`);
    finalResults = results;
    survivors = results.slice(0, keep).map((result) => result.candidate);
  }

  return {
    finalResults: finalResults.slice(0, options.finalTop),
    rounds,
  };
}

function printTop(label: string, results: CandidateResult[]): void {
  console.log(`\n${label}`);
  results.forEach((result, index) => {
    console.log(JSON.stringify({
      rank: index + 1,
      score: +result.score.toFixed(6),
      seedCount: result.seedCount,
      stabilityPenalty: +result.stabilityPenalty.toFixed(6),
      rtp: +result.rtp.toFixed(6),
      baseRtp: +result.baseRtp.toFixed(6),
      fsRtp: +result.fsRtp.toFixed(6),
      hitFreq: +result.hitFreq.toFixed(6),
      fsFreq: +result.fsFreq.toFixed(6),
      stdDevX: +result.stdDevX.toFixed(6),
      maxWinX: +result.maxWinX.toFixed(6),
      candidate: result.candidate,
    }));
  });
}

async function main(): Promise<void> {
  const coarseSamples = Number(process.argv[2] ?? 120);
  const refineSamples = Number(process.argv[3] ?? 80);
  const coarseSpins = Number(process.argv[4] ?? 5000);
  const refineSpins = Number(process.argv[5] ?? 20000);
  const market = (process.argv[6] as Market | undefined) ?? DEFAULT_MARKET;
  const seed = Number(process.argv[7] ?? 42);
  const verifySpins = Number(process.argv[8] ?? 50000);
  const workerCount = parseWorkerCount(process.argv[9], "SIM_SEARCH_WORKERS");
  const rng = mulberry32(seed);
  const coarseSeedCount = 1;
  const refineSeedCount = 2;
  const verifySeedCount = 5;
  const coarseSeeds = stageSeedSet(seed, coarseSeedCount, 1);
  const refineSeeds = stageSeedSet(seed, refineSeedCount, 10_000);
  const verifySeeds = stageSeedSet(seed, verifySeedCount, 20_000);
  const coarseBudgets = uniqueBudgets(coarseSpins, [0.25, 0.5]);
  const refineBudgets = uniqueBudgets(refineSpins, [0.4]);

  const coarseCandidates: Candidate[] = [];
  for (let i = 0; i < coarseSamples; i++) {
    coarseCandidates.push(sampleCandidate(rng.next));
  }
  const coarseRace = await raceCandidates("coarse", coarseCandidates, coarseBudgets, coarseSeeds, market, {
    finalTop: 10,
    minSurvivors: Math.min(10, coarseCandidates.length),
    survivorFractions: [0.5, 0.4],
    workerCount,
  });
  const coarseTop = coarseRace.finalResults;
  printTop("Coarse Top 10", coarseTop);

  const anchors = coarseTop.slice(0, 5).map((result) => result.candidate);
  const refineCandidates: Candidate[] = [];
  for (let i = 0; i < refineSamples; i++) {
    const anchor = anchors[i % anchors.length];
    if (anchor) refineCandidates.push(sampleCandidate(rng.next, anchor));
  }
  const refineRace = await raceCandidates("refine", refineCandidates, refineBudgets, refineSeeds, market, {
    finalTop: 10,
    minSurvivors: Math.min(10, refineCandidates.length),
    survivorFractions: [0.5],
    workerCount,
  });
  const refineTop = refineRace.finalResults;
  printTop("Refine Top 10", refineTop);

  const verifyResults = await evaluateCandidates(
    refineTop.slice(0, 5).map((result) => result.candidate),
    verifySpins,
    verifySeeds,
    market,
    workerCount,
  );
  verifyResults.sort((a, b) => a.score - b.score);
  printTop("Verify Top", verifyResults);

  const winner = verifyResults[0] ?? refineTop[0] ?? coarseTop[0];
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      coarseSamples,
      refineSamples,
      coarseSpins,
      refineSpins,
      verifySpins,
      market,
      seed,
      coarseSeedCount,
      refineSeedCount,
      verifySeedCount,
      workerCount,
      commonRandomNumbers: true,
    },
    targets: TARGETS,
    scoreWeights: SCORE_WEIGHTS,
    commonRandomSeeds: {
      coarse: coarseSeeds,
      refine: refineSeeds,
      verify: verifySeeds,
    },
    racing: {
      coarseBudgets,
      refineBudgets,
      coarseRounds: coarseRace.rounds,
      refineRounds: refineRace.rounds,
    },
    coarseTop,
    refineTop,
    verifyTop: verifyResults,
    bestCandidate: winner ?? null,
  };
  const outputDir = path.resolve(process.cwd(), "artifacts");
  mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "searchRtp.latest.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (winner) {
    const candidateProfilePath = path.join(outputDir, "searchRtp.bestCandidate.mathProfile.json");
    writeFileSync(
      candidateProfilePath,
      JSON.stringify(buildMathProfileDocument(buildCandidateConfig(winner.candidate), {
        profileId: "asian-tour-search-candidate",
        profileVersion: `search-${Date.now()}`,
        status: "candidate",
        source: reportPath,
        notes: [
          "Generated by sim:search.",
          `score=${winner.score.toFixed(6)}`,
          `seedCount=${winner.seedCount}`,
          `stabilityPenalty=${winner.stabilityPenalty.toFixed(6)}`,
          `rtp=${winner.rtp.toFixed(6)}`,
          `baseRtp=${winner.baseRtp.toFixed(6)}`,
          `fsRtp=${winner.fsRtp.toFixed(6)}`,
          `hitFreq=${winner.hitFreq.toFixed(6)}`,
          `fsFreq=${winner.fsFreq.toFixed(6)}`,
          `stdDevX=${winner.stdDevX.toFixed(6)}`,
          `maxWinX=${winner.maxWinX.toFixed(6)}`,
        ],
      }), null, 2),
    );
    console.log("\nBest Candidate");
    console.log(JSON.stringify(winner, null, 2));
    console.log(`\nWrote ${candidateProfilePath}`);
  }
}

async function runSearchWorker(): Promise<void> {
  const data = workerData as SearchWorkerData;
  if (!data || data.mode !== "evaluateCandidate") {
    throw new Error("unsupported search worker mode");
  }
  const result = await evaluateCandidate(data.candidate, data.spins, data.seeds, data.market);
  parentPort?.postMessage({ ok: true, result } satisfies SearchWorkerMessage);
}

if (!isMainThread) {
  runSearchWorker().catch((error) => {
    parentPort?.postMessage({ ok: false, error: (error as Error).message } satisfies SearchWorkerMessage);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
