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
import { adjustBalanceCents, createSession, getBalance, getSession, Session } from "./session";

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
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.session = session;
  next();
}

app.get("/api/config", (_req, res) => {
  res.json(buildConfigResponse());
});

app.post("/api/login", (req, res) => {
  const { username } = req.body ?? {};
  const market = parseMarket(req.body?.market) ?? DEFAULT_MARKET;
  if (typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "username required" });
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
  const betCents = parseAmountToCents(req.body?.bet);
  if (betCents === null) {
    res.status(400).json({ error: "bet must be a number with up to 2 decimals" });
    return;
  }
  const bet = centsToAmount(betCents);
  if (bet < BET.min || bet > BET.max) {
    res.status(400).json({ error: `bet out of range [${BET.min}, ${BET.max}]` });
    return;
  }
  if (betCents < amountToCents(BET.min) || betCents > amountToCents(BET.max)) {
    res.status(400).json({ error: `bet must align to 2-decimal currency precision` });
    return;
  }
  if (s.balanceCents < betCents) {
    res.status(400).json({ error: "insufficient balance" });
    return;
  }

  // Debit the settled bet, then play, then credit the settled round win.
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
  adjustBalanceCents(s, amountToCents(response.totalWin));
  response.balance = getBalance(s);
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
