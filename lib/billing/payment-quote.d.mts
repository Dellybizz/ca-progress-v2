export type PaymentMethod = "upi" | "card" | "emandate";
export function paymentMethod(value?: unknown): PaymentMethod;
export function quoteForMethod(input: {recurring: number; intro?: number | null; eligible?: boolean; trialDays?: number}, method: PaymentMethod): {paymentMethod: PaymentMethod; firstChargeSubunits: number; dueTodaySubunits: number; recurringPriceSubunits: number; introApplied: boolean};
export function mappingMatches(policy: Record<string, unknown>, mapping: Record<string, unknown> | null): boolean;
