import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import {
  MathProfileDocument,
  MathProfileTargets,
  MathProfileVerificationMetadata,
  buildMathProfileDocument,
} from "../engine/mathProfile";
import { DEFAULT_MARKET, Market } from "../gameMarkets";
import { loadProfileDocument, verifyProfile, VerifySummary } from "./verifyProfile";

interface BatchAggregate {
  rtp: number;
  baseRtp: number;
  fsRtp: number;
  hitFreq: number;
  fsFreq: number;
  stdDevX: number;
  maxWinX: number;
}

type StatisticalMetric = keyof Omit<BatchAggregate, "maxWinX">;

interface MetricConfidence {
  mean: number;
  sampleStdDev: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  target: number;
  tolerance: number;
  normalizedError: number;
  toleranceCoveredByCi95: boolean;
}

interface BatchConfidenceReport {
  metricCount: number;
  perMetric: Record<StatisticalMetric, MetricConfidence>;
}

interface BatchReport {
  generatedAt: string;
  profile: MathProfileDocument["metadata"];
  inputs: {
    profilePath: string;
    spinsPerSeed: number;
    seeds: number[];
    market: Market;
    workerCount: number;
  };
  targets: MathProfileTargets;
  aggregate: BatchAggregate;
  confidence: BatchConfidenceReport;
  failures: string[];
  passed: boolean;
  perSeed: VerifySummary[];
}

interface VerifyBatchWorkerData {
  mode: "verifySeed";
  profile: MathProfileDocument["config"];
  spinsPerSeed: number;
  seed: number;
  market: Market;
}

type VerifyBatchWorkerMessage =
  | { ok: true; summary: VerifySummary }
  | { ok: false; error: string };

function parseSeeds(value: string | undefined): number[] {
  if (!value) return [42, 99, 123, 777, 2026];
  const seeds = value.split(",").map((seed) => Number(seed.trim())).filter((seed) => Number.isFinite(seed));
  if (seeds.length === 0) throw new Error("seeds must be a comma-separated list of numbers");
  return seeds;
}

function workerExecArgv(): string[] {
  return __filename.endsWith(".ts") ? ["-r", "ts-node/register"] : [];
}

function defaultWorkerCount(): number {
  const envValue = Number(process.env.SIM_VERIFY_WORKERS);
  if (Number.isFinite(envValue) && envValue > 0) return Math.max(1, Math.floor(envValue));
  return Math.max(1, Math.min(availableParallelism() - 1, 4));
}

function parseWorkerCount(value: string | undefined): number {
  if (value === undefined) return defaultWorkerCount();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("workerCount must be a positive number");
  return Math.floor(parsed);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function aggregateSummaries(summaries: VerifySummary[]): BatchAggregate {
  return {
    rtp: average(summaries.map((summary) => summary.rtp)),
    baseRtp: average(summaries.map((summary) => summary.baseRtp)),
    fsRtp: average(summaries.map((summary) => summary.fsRtp)),
    hitFreq: average(summaries.map((summary) => summary.hitFreq)),
    fsFreq: average(summaries.map((summary) => summary.fsFreq)),
    stdDevX: average(summaries.map((summary) => summary.stdDevX)),
    maxWinX: Math.max(...summaries.map((summary) => summary.maxWinX)),
  };
}

function checkTarget(
  failures: string[],
  name: keyof Omit<BatchAggregate, "maxWinX">,
  aggregate: BatchAggregate,
  targets: MathProfileTargets,
): void {
  const target = targets[name];
  const actual = aggregate[name];
  const min = target.target - target.tolerance;
  const max = target.target + target.tolerance;
  if (actual < min || actual > max) {
    failures.push(`${name}=${actual.toFixed(6)} outside [${min.toFixed(6)}, ${max.toFixed(6)}]`);
  }
}

function metricConfidence(
  values: number[],
  target: MathProfileTargets[StatisticalMetric],
): MetricConfidence {
  const avg = average(values);
  const stdDev = sampleStdDev(values);
  const standardError = values.length > 0 ? stdDev / Math.sqrt(values.length) : 0;
  const margin95 = 1.96 * standardError;
  const targetMin = target.target - target.tolerance;
  const targetMax = target.target + target.tolerance;
  return {
    mean: avg,
    sampleStdDev: stdDev,
    standardError,
    ci95Low: avg - margin95,
    ci95High: avg + margin95,
    target: target.target,
    tolerance: target.tolerance,
    normalizedError: Math.abs(avg - target.target) / target.tolerance,
    toleranceCoveredByCi95: avg - margin95 >= targetMin && avg + margin95 <= targetMax,
  };
}

function buildConfidenceReport(summaries: VerifySummary[], targets: MathProfileTargets): BatchConfidenceReport {
  return {
    metricCount: summaries.length,
    perMetric: {
      rtp: metricConfidence(summaries.map((summary) => summary.rtp), targets.rtp),
      baseRtp: metricConfidence(summaries.map((summary) => summary.baseRtp), targets.baseRtp),
      fsRtp: metricConfidence(summaries.map((summary) => summary.fsRtp), targets.fsRtp),
      hitFreq: metricConfidence(summaries.map((summary) => summary.hitFreq), targets.hitFreq),
      fsFreq: metricConfidence(summaries.map((summary) => summary.fsFreq), targets.fsFreq),
      stdDevX: metricConfidence(summaries.map((summary) => summary.stdDevX), targets.stdDevX),
    },
  };
}

function evaluateFailures(aggregate: BatchAggregate, targets: MathProfileTargets): string[] {
  const failures: string[] = [];
  checkTarget(failures, "rtp", aggregate, targets);
  checkTarget(failures, "baseRtp", aggregate, targets);
  checkTarget(failures, "fsRtp", aggregate, targets);
  checkTarget(failures, "hitFreq", aggregate, targets);
  checkTarget(failures, "fsFreq", aggregate, targets);
  checkTarget(failures, "stdDevX", aggregate, targets);
  if (aggregate.maxWinX > targets.maxWinX.max) {
    failures.push(`maxWinX=${aggregate.maxWinX.toFixed(6)} above ${targets.maxWinX.max.toFixed(6)}`);
  }
  return failures;
}

function verifySeedInWorker(
  profile: MathProfileDocument["config"],
  spinsPerSeed: number,
  seed: number,
  market: Market,
): Promise<VerifySummary> {
  const data: VerifyBatchWorkerData = { mode: "verifySeed", profile, spinsPerSeed, seed, market };
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: data,
      execArgv: workerExecArgv(),
    });
    let settled = false;

    worker.once("message", (message: VerifyBatchWorkerMessage) => {
      settled = true;
      if (message.ok) {
        resolve(message.summary);
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
        reject(new Error(`verify worker exited with code ${code}`));
      }
    });
  });
}

async function verifySeeds(
  profile: MathProfileDocument["config"],
  spinsPerSeed: number,
  seeds: number[],
  market: Market,
  workerCount: number,
): Promise<VerifySummary[]> {
  if (workerCount <= 1 || seeds.length <= 1) {
    const summaries: VerifySummary[] = [];
    for (const seed of seeds) {
      summaries.push(await verifyProfile(profile, spinsPerSeed, seed, market));
    }
    return summaries;
  }

  const summaries = new Array<VerifySummary>(seeds.length);
  let nextIndex = 0;
  let active = 0;
  let completed = 0;

  return new Promise((resolve, reject) => {
    const launchNext = () => {
      while (active < workerCount && nextIndex < seeds.length) {
        const index = nextIndex;
        nextIndex += 1;
        active += 1;
        verifySeedInWorker(profile, spinsPerSeed, seeds[index], market)
          .then((summary) => {
            summaries[index] = summary;
            active -= 1;
            completed += 1;
            if (completed === seeds.length) {
              resolve(summaries);
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

async function verifyBatch(
  profilePath: string,
  spinsPerSeed: number,
  seeds: number[],
  market: Market,
  workerCount: number,
): Promise<BatchReport> {
  const profile = loadProfileDocument(profilePath);
  const perSeed = await verifySeeds(profile.config, spinsPerSeed, seeds, market, workerCount);

  const aggregate = aggregateSummaries(perSeed);
  const confidence = buildConfidenceReport(perSeed, profile.metadata.targets);
  const failures = evaluateFailures(aggregate, profile.metadata.targets);
  return {
    generatedAt: new Date().toISOString(),
    profile: profile.metadata,
    inputs: { profilePath, spinsPerSeed, seeds, market, workerCount },
    targets: profile.metadata.targets,
    aggregate,
    confidence,
    failures,
    passed: failures.length === 0,
    perSeed,
  };
}

function withVerificationMetadata(
  profile: MathProfileDocument,
  report: BatchReport,
  reportPath: string,
): MathProfileDocument {
  const verification: MathProfileVerificationMetadata = {
    passed: report.passed,
    verifiedAt: report.generatedAt,
    market: report.inputs.market,
    spinsPerSeed: report.inputs.spinsPerSeed,
    seeds: report.inputs.seeds,
    aggregate: report.aggregate,
    failures: report.failures,
    reportPath,
  };

  return buildMathProfileDocument(profile.config, {
    ...profile.metadata,
    status: report.passed ? "verified" : "rejected",
    updatedAt: report.generatedAt,
    verification,
  });
}

async function main(): Promise<void> {
  const profilePath = process.argv[2];
  if (!profilePath) {
    throw new Error("usage: npm run sim:verify-batch -- <profile.json> [spinsPerSeed] [seedsCsv] [market] [outputPrefix] [workerCount]");
  }

  const spinsPerSeed = Number(process.argv[3] ?? 100_000);
  if (!Number.isFinite(spinsPerSeed) || spinsPerSeed <= 0) throw new Error("spinsPerSeed must be a positive number");
  const seeds = parseSeeds(process.argv[4]);
  const market = (process.argv[5] as Market | undefined) ?? DEFAULT_MARKET;
  const outputPrefix = process.argv[6] ?? "artifacts/verifyBatch.latest";
  const workerCount = parseWorkerCount(process.argv[7]);

  const profile = loadProfileDocument(profilePath);
  const report = await verifyBatch(profilePath, spinsPerSeed, seeds, market, workerCount);

  const reportPath = path.resolve(process.cwd(), `${outputPrefix}.json`);
  const verifiedProfilePath = path.resolve(process.cwd(), `${outputPrefix}.mathProfile.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(
    verifiedProfilePath,
    JSON.stringify(withVerificationMetadata(profile, report, reportPath), null, 2),
  );

  console.log(JSON.stringify({
    passed: report.passed,
    aggregate: report.aggregate,
    confidence: report.confidence,
    failures: report.failures,
    workerCount,
    reportPath,
    verifiedProfilePath,
  }, null, 2));
}

async function runVerifyWorker(): Promise<void> {
  const data = workerData as VerifyBatchWorkerData;
  if (!data || data.mode !== "verifySeed") {
    throw new Error("unsupported verify worker mode");
  }
  const summary = await verifyProfile(data.profile, data.spinsPerSeed, data.seed, data.market);
  parentPort?.postMessage({ ok: true, summary } satisfies VerifyBatchWorkerMessage);
}

if (!isMainThread) {
  runVerifyWorker().catch((error) => {
    parentPort?.postMessage({ ok: false, error: (error as Error).message } satisfies VerifyBatchWorkerMessage);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
