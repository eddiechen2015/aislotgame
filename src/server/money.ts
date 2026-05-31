const MONEY_SCALE = 100;
const CENT_EPSILON = 1e-9;

export function amountToCents(amount: number): number {
  return Math.round(amount * MONEY_SCALE);
}

export function centsToAmount(cents: number): number {
  return cents / MONEY_SCALE;
}

export function isTwoDecimalAmount(amount: number): boolean {
  return Math.abs(amount * MONEY_SCALE - amountToCents(amount)) < CENT_EPSILON;
}

export function parseAmountToCents(value: unknown): number | null {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : NaN;

  if (!Number.isFinite(amount) || amount < 0 || !isTwoDecimalAmount(amount)) return null;
  return amountToCents(amount);
}
