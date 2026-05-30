/**
 * End-to-end batch spin test.
 *
 * Logs in via /api/login, then fires N spins through /api/spin, then prints
 * an aggregate report. Use this to exercise the full server stack (auth +
 * spin endpoint + balance bookkeeping) — complementary to the engine-level
 * `npm run sim` which calls playRound() directly.
 *
 * Usage:
 *   npm run test:spin                       # 10,000 spins, bet 1.0
 *   npm run test:spin -- 1000 0.10          # spins, bet
 *   npm run test:spin -- 5000 1.0 http://localhost:3000 myuser
 *
 * The server must already be running (`npm run dev`).
 *
 * Requires Node 18+ for global fetch.
 */
import { EXPOSURE } from "../engine/config";

interface CliArgs {
  spins: number;
  bet: number;
  baseUrl: string;
  username: string;
  topUpThreshold: number;  // re-login (fresh balance) when balance < this × bet
  verboseEvery: number;    // print progress every N spins
}

interface SpinResponse {
  balance: number;
  bet: number;
  totalWin: number;
  capped: boolean;
  base: {
    cascadeWin: number;
    scatterCount: number;
    scatterPay: number;
    freeSpinsTriggered: boolean;
    cascades: Array<{ cascadeWin: number }>;
  };
  freeSpins: { totalSpins: number; totalWin: number; spins: Array<{ retrigger: boolean }> } | null;
}

interface LoginResponse {
  token: string;
  username: string;
  balance: number;
}

interface Stats {
  spins: number;
  bet: number;
  totalBet: number;
  totalWin: number;
  baseCascadeWin: number;
  scatterWin: number;
  freeSpinWin: number;
  hits: number;                 // totalWin > 0
  freeSpinTriggers: number;
  retriggerCount: number;       // number of FS retriggers across all sessions
  freeSpinsPlayed: number;      // sum of spins inside FS sessions
  cappedSpins: number;
  cascadeStepsTotal: number;
  maxCascadeChain: number;
  maxWinX: number;
  topWins: Array<{ index: number; winX: number; freeSpins: boolean }>;
  winDistribution: Record<string, number>;
  errors: number;
  loginCount: number;
}

const BUCKETS: Array<[string, (x: number) => boolean]> = [
  ["0",            (x) => x === 0],
  ["(0,1)",        (x) => x > 0 && x < 1],
  ["[1,5)",        (x) => x >= 1 && x < 5],
  ["[5,10)",       (x) => x >= 5 && x < 10],
  ["[10,25)",      (x) => x >= 10 && x < 25],
  ["[25,50)",      (x) => x >= 25 && x < 50],
  ["[50,100)",     (x) => x >= 50 && x < 100],
  ["[100,250)",    (x) => x >= 100 && x < 250],
  ["[250,500)",    (x) => x >= 250 && x < 500],
  ["[500,1000)",   (x) => x >= 500 && x < 1000],
  ["[1000,5000)",  (x) => x >= 1000 && x < 5000],
  ["[5000,MAX]",   (x) => x >= 5000],
];

function bucketOf(x: number): string {
  for (const [label, test] of BUCKETS) if (test(x)) return label;
  return "0";
}

function fmt(n: number, d = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
}
function pct(n: number): string { return (n * 100).toFixed(4) + "%"; }

function parseArgs(argv: string[]): CliArgs {
  return {
    spins:    argv[0] ? Number(argv[0])    : 10_000,
    bet:      argv[1] ? Number(argv[1])    : 1.0,
    baseUrl:  argv[2] || process.env.BASE_URL || "http://localhost:3000",
    username: argv[3] || `batch-${Date.now()}`,
    topUpThreshold: 5,
    verboseEvery: 0, // computed below
  };
}

async function login(baseUrl: string, username: string): Promise<LoginResponse> {
  const r = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!r.ok) throw new Error(`login failed: HTTP ${r.status}`);
  return r.json() as Promise<LoginResponse>;
}

async function spin(baseUrl: string, token: string, bet: number): Promise<SpinResponse> {
  const r = await fetch(`${baseUrl}/api/spin`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ bet }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`spin failed: HTTP ${r.status} ${text}`);
  }
  return r.json() as Promise<SpinResponse>;
}

function newStats(bet: number): Stats {
  return {
    spins: 0, bet, totalBet: 0, totalWin: 0,
    baseCascadeWin: 0, scatterWin: 0, freeSpinWin: 0,
    hits: 0, freeSpinTriggers: 0, retriggerCount: 0, freeSpinsPlayed: 0,
    cappedSpins: 0, cascadeStepsTotal: 0, maxCascadeChain: 0,
    maxWinX: 0, topWins: [], winDistribution: {}, errors: 0, loginCount: 0,
  };
}

function recordSpin(stats: Stats, idx: number, r: SpinResponse): void {
  stats.spins += 1;
  stats.totalBet += r.bet;
  stats.totalWin += r.totalWin;
  stats.baseCascadeWin += r.base.cascadeWin;
  stats.scatterWin += r.base.scatterPay;
  if (r.totalWin > 0) stats.hits += 1;
  if (r.capped) stats.cappedSpins += 1;
  stats.cascadeStepsTotal += r.base.cascades.length;
  if (r.base.cascades.length > stats.maxCascadeChain) stats.maxCascadeChain = r.base.cascades.length;
  if (r.freeSpins) {
    stats.freeSpinTriggers += 1;
    stats.freeSpinWin += r.freeSpins.totalWin;
    stats.freeSpinsPlayed += r.freeSpins.totalSpins;
    for (const fs of r.freeSpins.spins) if (fs.retrigger) stats.retriggerCount += 1;
  }
  const winX = r.totalWin / r.bet;
  if (winX > stats.maxWinX) stats.maxWinX = winX;
  const k = bucketOf(winX);
  stats.winDistribution[k] = (stats.winDistribution[k] ?? 0) + 1;

  // Track top 5 wins.
  if (winX > 0) {
    stats.topWins.push({ index: idx, winX, freeSpins: !!r.freeSpins });
    stats.topWins.sort((a, b) => b.winX - a.winX);
    if (stats.topWins.length > 5) stats.topWins.length = 5;
  }
}

function report(stats: Stats, baseUrl: string, durationMs: number): void {
  const rtp = stats.totalBet > 0 ? stats.totalWin / stats.totalBet : 0;
  const baseRtp = stats.totalBet > 0 ? (stats.baseCascadeWin + stats.scatterWin) / stats.totalBet : 0;
  const fsRtp = stats.totalBet > 0 ? stats.freeSpinWin / stats.totalBet : 0;
  const hitFreq = stats.spins > 0 ? stats.hits / stats.spins : 0;
  const fsFreq = stats.spins > 0 ? stats.freeSpinTriggers / stats.spins : 0;
  const avgCascade = stats.spins > 0 ? stats.cascadeStepsTotal / stats.spins : 0;

  console.log("");
  console.log("==================== BATCH SPIN TEST ====================");
  console.log(`server:                  ${baseUrl}`);
  console.log(`spins requested:         ${fmt(stats.spins, 0)}`);
  console.log(`bet:                     ${stats.bet.toFixed(2)}`);
  console.log(`total bet:               ${fmt(stats.totalBet)}`);
  console.log(`total win:               ${fmt(stats.totalWin)}`);
  console.log(`elapsed:                 ${(durationMs / 1000).toFixed(2)}s  (${(stats.spins / (durationMs / 1000)).toFixed(0)} spins/s)`);
  console.log(`logins (incl. top-ups):  ${stats.loginCount}`);
  console.log(`errors:                  ${stats.errors}`);
  console.log("");
  console.log(`actual RTP:              ${pct(rtp)}    (target 96.20%)`);
  console.log(`  base game RTP:         ${pct(baseRtp)}    (target 58.0%)`);
  console.log(`  free spins RTP:        ${pct(fsRtp)}    (target 38.2%)`);
  console.log("");
  console.log(`hit frequency:           ${pct(hitFreq)}  (target ~30%)`);
  console.log(`FS trigger frequency:    ${pct(fsFreq)}` + (fsFreq > 0 ? `  (1 in ${(1 / fsFreq).toFixed(0)})` : ""));
  console.log(`FS retriggers:           ${stats.retriggerCount}`);
  console.log(`FS spins played:         ${stats.freeSpinsPlayed}`);
  console.log(`avg cascades / spin:     ${avgCascade.toFixed(3)}`);
  console.log(`max cascade chain:       ${stats.maxCascadeChain}  (cap ${EXPOSURE.maxCascadesPerSpin})`);
  console.log(`capped spins (10000x):   ${stats.cappedSpins}`);
  console.log(`max win (× bet):         ${stats.maxWinX.toFixed(2)}x  (cap ${EXPOSURE.maxWinX}x)`);
  console.log("");
  console.log("Win distribution (× bet):");
  for (const [label] of BUCKETS) {
    const n = stats.winDistribution[label] ?? 0;
    const p = stats.spins > 0 ? (n / stats.spins) * 100 : 0;
    console.log(`  ${label.padEnd(14)} ${String(n).padStart(10)}  ${p.toFixed(4)}%`);
  }
  console.log("");
  if (stats.topWins.length > 0) {
    console.log("Top wins this run:");
    stats.topWins.forEach((w, i) => {
      console.log(`  #${i + 1}  spin ${w.index.toString().padStart(6)}  win ${w.winX.toFixed(2)}x  ${w.freeSpins ? "(FS)" : "(base)"}`);
    });
  }
  console.log("=========================================================");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  args.verboseEvery = Math.max(1, Math.floor(args.spins / 10));

  console.log("Asian Tour — End-to-end batch spin test");
  console.log("---------------------------------------");
  console.log(`server: ${args.baseUrl}`);
  console.log(`spins:  ${fmt(args.spins, 0)}`);
  console.log(`bet:    ${args.bet}`);
  console.log(`user:   ${args.username}`);
  console.log("");

  let session: LoginResponse;
  try {
    session = await login(args.baseUrl, args.username);
  } catch (e: any) {
    console.error(`Could not log in to ${args.baseUrl}: ${e.message}`);
    console.error("Is the server running?  Start it with:  npm run dev");
    process.exit(1);
    return;
  }
  const stats = newStats(args.bet);
  stats.loginCount = 1;
  console.log(`logged in as "${session.username}", starting balance ${session.balance}`);

  const t0 = Date.now();

  for (let i = 1; i <= args.spins; i++) {
    // Top up by re-logging in if we run out of balance (each fresh login
    // gets a new starting balance from the server). Keeps the test running
    // even if the player goes broke.
    if (session.balance < args.bet * args.topUpThreshold) {
      try {
        session = await login(args.baseUrl, args.username);
        stats.loginCount += 1;
      } catch (e: any) {
        console.error(`Re-login failed at spin ${i}: ${e.message}`);
        stats.errors += 1;
        break;
      }
    }
    try {
      const r = await spin(args.baseUrl, session.token, args.bet);
      session.balance = r.balance;
      recordSpin(stats, i, r);
    } catch (e: any) {
      stats.errors += 1;
      // After a 401 or other error, re-login once and continue.
      try {
        session = await login(args.baseUrl, args.username);
        stats.loginCount += 1;
      } catch {
        console.error(`Aborting after error at spin ${i}: ${e.message}`);
        break;
      }
    }

    if (i % args.verboseEvery === 0 || i === args.spins) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i / elapsed).toFixed(0);
      const partialRtp = stats.totalBet > 0 ? stats.totalWin / stats.totalBet : 0;
      console.log(
        `  ${((i / args.spins) * 100).toFixed(0).padStart(3)}%  ` +
        `spin ${i.toString().padStart(7)}  ` +
        `rtp=${pct(partialRtp)}  ` +
        `hits=${stats.hits}  fsTrig=${stats.freeSpinTriggers}  ` +
        `rate=${rate}/s`,
      );
    }
  }

  const dt = Date.now() - t0;
  report(stats, args.baseUrl, dt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
