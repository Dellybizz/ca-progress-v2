export function introductoryConsumed(db: {prepare(query: string): {bind(...values: unknown[]): {first(): Promise<unknown>}}}, userId: string, ownPaymentId?: string | null): Promise<boolean>;
