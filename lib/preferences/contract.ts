export const themeOptions = ["system", "light", "dark"] as const;
export const accentOptions = ["indigo", "violet", "emerald", "rose"] as const;
export const densityOptions = ["comfortable", "compact"] as const;

export type ThemePreference = (typeof themeOptions)[number];
export type AccentPreference = (typeof accentOptions)[number];
export type DensityPreference = (typeof densityOptions)[number];
export type UiPreferences = { theme: ThemePreference; accent: AccentPreference; density: DensityPreference; reduceMotion: boolean };
export const defaultUiPreferences: UiPreferences = { theme: "system", accent: "indigo", density: "comfortable", reduceMotion: false };
export function isUiPreferences(value: unknown): value is UiPreferences { if (!value || typeof value !== "object") return false; const input = value as Partial<UiPreferences>; return themeOptions.includes(input.theme as ThemePreference) && accentOptions.includes(input.accent as AccentPreference) && densityOptions.includes(input.density as DensityPreference) && typeof input.reduceMotion === "boolean"; }
