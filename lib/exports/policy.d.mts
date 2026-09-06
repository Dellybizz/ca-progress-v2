export type ExportKind = "progress_pdf" | "study_csv" | "test_history_csv" | "full_backup";
export type InternalPlanTier = "free" | "basic" | "pro";

export const EXPORT_KINDS: ReadonlyArray<ExportKind>;
export const EXPORT_PRODUCT_PLANS: Readonly<Record<InternalPlanTier, "Free" | "Pro" | "Premium">>;
export function normalizeExportTier(value: unknown): InternalPlanTier;
export function exportProductPlanLabel(value: unknown): "Free" | "Pro" | "Premium";
export function canUseExport(tier: unknown, kind: unknown): boolean;
export function exportRequirement(kind: unknown): Readonly<{ tier: InternalPlanTier; productPlan: "Free" | "Pro" | "Premium" }> | null;
