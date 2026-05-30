import { amountToCents } from "./server/money";

export const MARKETS = ["MGA", "Curacao", "Brazil", "Sweepstake"] as const;
export type Market = typeof MARKETS[number];

export const DEFAULT_MARKET: Market = "MGA";

export const ABSOLUTE_WIN_CAP: Record<Market, number> = {
  MGA: 500_000,
  Curacao: 1_000_000,
  Brazil: 500_000,
  Sweepstake: 250_000,
};

export const ABSOLUTE_WIN_CAP_CENTS: Record<Market, number> = {
  MGA: amountToCents(ABSOLUTE_WIN_CAP.MGA),
  Curacao: amountToCents(ABSOLUTE_WIN_CAP.Curacao),
  Brazil: amountToCents(ABSOLUTE_WIN_CAP.Brazil),
  Sweepstake: amountToCents(ABSOLUTE_WIN_CAP.Sweepstake),
};

export function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value);
}

export function parseMarket(value: unknown): Market | null {
  return typeof value === "string" && isMarket(value) ? value : null;
}
