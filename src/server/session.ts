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
  /** Per-session spin lock to prevent concurrent spin requests. */
  spinLocked: boolean;
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
    spinLocked: false,
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

export function acquireSpinLock(session: Session): boolean {
  if (session.spinLocked) return false;
  session.spinLocked = true;
  return true;
}

export function releaseSpinLock(session: Session): void {
  session.spinLocked = false;
}

export function adjustBalanceCents(session: Session, deltaCents: number): number {
  const newBalance = session.balanceCents + deltaCents;
  if (newBalance < 0) {
    throw new Error(
      `Balance underflow: current=${session.balanceCents}, delta=${deltaCents}, result=${newBalance}`,
    );
  }
  session.balanceCents = newBalance;
  return session.balanceCents;
}
