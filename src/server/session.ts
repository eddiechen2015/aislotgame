/**
 * In-memory session store. Demo only — replace with PostgreSQL + Redis
 * for production per overview.md.
 */
import { randomBytes } from "crypto";
import { DEFAULT_MARKET, Market } from "../gameMarkets";
import { centsToAmount } from "./money";

export interface Session {
  token: string;
  username: string;
  market: Market;
  balanceCents: number;
  createdAt: number;
  /** Active free spin session, if any (carries across spin calls). */
  // Note: in this demo the entire FS session is resolved synchronously inside
  // playRound() and reported in one response. No persistent FS state needed.
}

const sessions = new Map<string, Session>();

const STARTING_BALANCE_CENTS = 1000_00;

export function createSession(username: string, market: Market = DEFAULT_MARKET): Session {
  const token = randomBytes(16).toString("hex");
  const s: Session = {
    token,
    username,
    market,
    balanceCents: STARTING_BALANCE_CENTS,
    createdAt: Date.now(),
  };
  sessions.set(token, s);
  return s;
}

export function getSession(token: string | undefined): Session | undefined {
  if (!token) return undefined;
  return sessions.get(token);
}

export function getBalance(session: Session): number {
  return centsToAmount(session.balanceCents);
}

export function adjustBalanceCents(session: Session, deltaCents: number): number {
  session.balanceCents = Math.max(0, session.balanceCents + deltaCents);
  return session.balanceCents;
}
