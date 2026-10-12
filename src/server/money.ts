import type { Money } from "@/contract/trip";

export const money = (amountMinor: number, currency: string): Money => ({
  amountMinor: Math.round(amountMinor),
  currency,
});

/** Whole currency units → minor units (TRY → kuruş). */
export const major = (amount: number, currency = "TRY"): Money => money(amount * 100, currency);

export function sum(items: Money[], currency: string): Money {
  let total = 0;
  for (const m of items) {
    if (m.currency !== currency) {
      throw new Error(`Currency mismatch: expected ${currency}, got ${m.currency}`);
    }
    total += m.amountMinor;
  }
  return money(total, currency);
}

export function formatMoney(m: Money): string {
  const value = m.amountMinor / 100;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${m.currency}`;
}
