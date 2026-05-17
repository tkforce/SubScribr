// Hardcoded FX rates → TWD. Week 11 polish can swap in a real API.
const RATES_TO_TWD: Record<string, number> = {
  TWD: 1,
  USD: 31.5,
  JPY: 0.21,
  EUR: 34,
};

export function convertToTwd(amount: number, currency: string): number {
  const rate = RATES_TO_TWD[currency.toUpperCase()];
  if (rate === undefined) {
    throw new Error(`Unsupported currency for FX conversion: ${currency}`);
  }
  return Math.round(amount * rate * 100) / 100;
}
