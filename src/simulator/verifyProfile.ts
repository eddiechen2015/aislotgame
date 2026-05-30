import { playRound } from "../engine/spinEngine";
import { mulberry32 } from "../engine/rng";
import { RuntimeMathConfig, withRuntimeMathConfig } from "../engine/mathRuntime";
import { MathProfileDocument } from "../engine/mathProfile";
import { loadMathProfileDocument } from "../engine/mathProfileLoader";
import { DEFAULT_MARKET, Market } from "../gameMarkets";
import { settleSpinResult } from "../settlement/settleSpin";

export interface VerifySummary {
  spins: number;
  market: Market;
  seed: number;
  rtp: number;
  baseRtp: number;
  fsRtp: number;
  hitFreq: number;
  fsFreq: number;
  maxWinX: number;
  stdDevX: number;
}

export function loadProfileDocument(pathname: string): MathProfileDocument {
  return loadMathProfileDocument(pathname);
}

export function loadProfile(pathname: string): RuntimeMathConfig {
  return loadProfileDocument(pathname).config;
}

export async function verifyProfile(
  profile: RuntimeMathConfig,
  spins: number,
  seed: number,
  market: Market,
): Promise<VerifySummary> {
  return withRuntimeMathConfig(profile, async () => {
    const rng = mulberry32(seed);
    let totalWin = 0;
    let baseWin = 0;
    let fsWin = 0;
    let hits = 0;
    let fsTriggers = 0;
    let maxWinX = 0;
    let sumWinX = 0;
    let sumWinXSq = 0;

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
      sumWinXSq += winX * winX;
      maxWinX = Math.max(maxWinX, winX);
    }

    const meanWinX = sumWinX / spins;
    const varianceWinX = sumWinXSq / spins - meanWinX * meanWinX;

    return {
      spins,
      market,
      seed,
      rtp: totalWin / spins,
      baseRtp: baseWin / spins,
      fsRtp: fsWin / spins,
      hitFreq: hits / spins,
      fsFreq: fsTriggers / spins,
      maxWinX,
      stdDevX: Math.sqrt(Math.max(0, varianceWinX)),
    };
  });
}

async function main(): Promise<void> {
  const profilePath = process.argv[2];
  if (!profilePath) throw new Error("usage: npm run sim:verify -- <profile.json> [spins] [seed] [market]");
  const spins = Number(process.argv[3] ?? 100000);
  const seed = Number(process.argv[4] ?? 42);
  const market = (process.argv[5] as Market | undefined) ?? DEFAULT_MARKET;
  const profile = loadProfileDocument(profilePath);
  const summary = await verifyProfile(profile.config, spins, seed, market);
  console.log(JSON.stringify({
    profile: profile.metadata,
    summary,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
