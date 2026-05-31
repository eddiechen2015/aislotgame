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
  lastActiveAt: number;
  /** Per-session spin lock to prevent concurrent spin requests. */
  spinLocked: boolean;
}

const sessions = new Map<string, Session>();

const STARTING_BALANCE_CENTS = 1000_00;
/** Session TTL: 30 minutes of inactivity. */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Maximum concurrent sessions to prevent memory exhaustion. */
const MAX_SESSIONS = 10_000;
/** Cleanup runs at most once per 60 seconds. */
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanupAt = 0;

function evictExpiredSessions(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [token, session] of sessions) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}

export function createSession(username: string, market: Market = DEFAULT_MARKET): Session | null {
  evictExpiredSessions();
  if (sessions.size >= MAX_SESSIONS) {
    return null;
  }
  const token = randomBytes(16).toString("hex");
  const now = Date.now();
  const s: Session = {
    token,
    username,
    market,
    balanceCents: STARTING_BALANCE_CENTS,
    createdAt: now,
    lastActiveAt: now,
    spinLocked: false,
  };
  sessions.set(token, s);
  return s;
}

export function getSession(token: string | undefined): Session | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  const now = Date.now();
  if (now - session.lastActiveAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return undefined;
  }
  session.lastActiveAt = now;
  return session;
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
