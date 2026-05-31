/**
 * Asian Tour test server.
 *
 * Endpoints:
 *   POST /api/login     { username, password? } -> { token, balance }
 *   GET  /api/me        Authorization: Bearer <token> -> session info
 *   POST /api/spin      { bet }                       -> SpinResult + balance
 *   GET  /api/config    -> public game config (bet range, paytable)
 *
 * Auth: simple bearer token from /api/login. NOT for production.
 * Static: serves /public for the test front page.
 *
 * NOTE: overview.md targets NestJS for production. This Express server is a
 * lightweight test harness so the math engine, RTP simulator and front page
 * can be exercised together with minimal scaffolding. Module boundaries
 * (auth, spin) mirror NestJS controllers so this maps cleanly to NestJS later.
 */
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";

import { getActiveMathProfileMetadata, loadMathProfileFromEnv } from "../engine/mathProfileLoader";
import { playRound } from "../engine/spinEngine";
import { BET } from "../engine/config";
import { DEFAULT_MARKET, parseMarket } from "../gameMarkets";
import { buildRoundAuditEvent, logAbsoluteCapAudit, logRoundAudit } from "./audit";
import { createAuditedRng } from "./auditRng";
import { buildConfigResponse } from "./configResponse";
import { buildSpinResponse, settleSpinResultDetailed } from "./spinResponse";
import { amountToCents, centsToAmount, parseAmountToCents } from "./money";
import { createRoundId } from "./roundId";
import { acquireSpinLock, adjustBalanceCents, createSession, getBalance, getSession, releaseSpinLock, Session } from "./session";

const loadedProfile = loadMathProfileFromEnv();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const publicDir = path.resolve(__dirname, "..", "..", "public");
app.use(express.static(publicDir));

interface AuthedRequest extends Request {
  session?: Session;
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  const token = m?.[1];
  const session = getSession(token);
  if (!session) {
    console.warn(`[auth-fail] ${req.method} ${req.path} ip=${req.ip}`);
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.session = session;
  next();
}

app.get("/api/config", (_req, res) => {
  res.json(buildConfigResponse());
});

const MAX_USERNAME_LENGTH = 100;

app.post("/api/login", (req, res) => {
  const { username } = req.body ?? {};
  const market = parseMarket(req.body?.market) ?? DEFAULT_MARKET;
  if (typeof username !== "string" || username.trim().length === 0 || username.length > MAX_USERNAME_LENGTH) {
    res.status(400).json({ error: "username required (max 100 characters)" });
    return;
  }
  // Demo-only: no password check. Any username creates a fresh session.
  const s = createSession(username.trim(), market);
  res.json({
    token: s.token,
    username: s.username,
    market: s.market,
    balance: getBalance(s),
  });
});

app.get("/api/me", authMiddleware, (req: AuthedRequest, res) => {
  const s = req.session!;
  res.json({ username: s.username, market: s.market, balance: getBalance(s) });
});

app.post("/api/spin", authMiddleware, (req: AuthedRequest, res) => {
  const s = req.session!;

  // Prevent concurrent spin requests on the same session.
  if (!acquireSpinLock(s)) {
    res.status(429).json({ error: "spin already in progress" });
    return;
  }

  try {
    const betCents = parseAmountToCents(req.body?.bet);
    if (betCents === null) {
      res.status(400).json({ error: "bet must be a number with up to 2 decimals" });
      return;
    }
    const minCents = amountToCents(BET.min);
    const maxCents = amountToCents(BET.max);
    if (betCents < minCents || betCents > maxCents) {
      res.status(400).json({ error: `bet out of range [${BET.min}, ${BET.max}]` });
      return;
    }
    const bet = centsToAmount(betCents);
    if (s.balanceCents < betCents) {
      res.status(400).json({ error: "insufficient balance" });
      return;
    }

    const roundId = createRoundId();
    const balanceBeforeCents = s.balanceCents;
    adjustBalanceCents(s, -betCents);
    const balanceAfterDebitCents = s.balanceCents;
    const auditedRng = createAuditedRng();
    const result = playRound(bet, auditedRng.rng);
    const settled = settleSpinResultDetailed(result, s.market);
    for (const event of settled.auditEvents) {
      logAbsoluteCapAudit(event, {
        username: s.username,
        token: s.token,
        bet,
        roundId,
      });
    }
    const response = buildSpinResponse(settled.settled, s.balanceCents, s.market);
    response.roundId = roundId;
    response.capped = settled.settled.capped;
    response.absoluteCapped = settled.absoluteCapped;
    response.market = s.market;
    const winCents = amountToCents(response.totalWin);
    adjustBalanceCents(s, winCents);
    response.balance = getBalance(s);

    // Balance consistency assertion: final = before - bet + win.
    const expectedCents = balanceBeforeCents - betCents + winCents;
    if (s.balanceCents !== expectedCents) {
      console.error(
        `[CRITICAL] Balance mismatch! expected=${expectedCents}, actual=${s.balanceCents}, ` +
        `roundId=${roundId}, before=${balanceBeforeCents}, bet=${betCents}, win=${winCents}`,
      );
    }

    logRoundAudit(buildRoundAuditEvent({
      roundId,
      username: s.username,
      token: s.token,
      market: s.market,
      betCents,
      balanceBeforeCents,
      balanceAfterDebitCents,
      balanceAfterCreditCents: s.balanceCents,
      mathProfile: getActiveMathProfileMetadata(),
      rngTrace: auditedRng.trace,
      rawResult: result,
      settled,
    }));

    res.json(response);
  } finally {
    releaseSpinLock(s);
  }
});

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`Asian Tour server listening on http://${HOST}:${PORT}`);
  console.log(`Test page:  http://${HOST}:${PORT}/`);
  console.log(
    `Math profile: ${loadedProfile.metadata.profileId}@${loadedProfile.metadata.profileVersion} ` +
    `(${loadedProfile.metadata.status})`,
  );
});
