/** Paystack NGN amounts are always kobo (1 Naira = 100 kobo). */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}
