/** Szacowanie kosztów płatnych odcinków na podstawie Google Routes API (TOLLS). */

export type TollInfo = {
  estimatedPrice?: Array<{ currencyCode?: string; units?: string | number; nanos?: number }>;
};

export type TollEstimate = { amount: number; currency: string };

/** Zamienia tollInfo z Routes API na kwotę; null, gdy Google nie zwraca danych. */
export function tollFromInfo(info: TollInfo | undefined): TollEstimate | null {
  const price = info?.estimatedPrice?.[0];
  if (!price) return null;
  const units = Number(price.units ?? 0);
  const nanos = Number(price.nanos ?? 0);
  const amount = Math.round((units + nanos / 1e9) * 100) / 100;
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: price.currencyCode ?? "PLN" };
}

/** Tekst kosztów trasy z komunikatem, gdy brak danych. */
export function tollText(toll: TollEstimate | null): string {
  if (!toll) {
    return "Koszty przejazdu: brak danych o płatnych odcinkach i winietach dla tej trasy";
  }
  if (toll.amount === 0) return "Koszty przejazdu: brak płatnych odcinków (0 zł)";
  return `Szacowany koszt płatnych odcinków: ${toll.amount.toLocaleString("pl-PL", {
    style: "currency",
    currency: toll.currency,
  })}`;
}
