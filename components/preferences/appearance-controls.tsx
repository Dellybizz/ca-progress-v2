"use client";

import { useSyncExternalStore } from "react";
import { accentOptions, defaultUiPreferences, densityOptions, isUiPreferences, themeOptions, type UiPreferences } from "@/lib/preferences/contract";
import { APPEARANCE_STORAGE_KEY, saveAppearance } from "./appearance-runtime";

const labels = { system: "System", light: "Light", dark: "Dark", comfortable: "Comfortable", compact: "Compact" } as const;
const swatches = { indigo: "#5b5bd6", violet: "#7456cf", emerald: "#0e8a7b", rose: "#d94d6d" } as const;
const defaultSnapshot = JSON.stringify(defaultUiPreferences);

function subscribe(listener: () => void) {
  const update = () => listener();
  window.addEventListener("storage", update);
  window.addEventListener("ca-progress:appearance", update);
  return () => { window.removeEventListener("storage", update); window.removeEventListener("ca-progress:appearance", update); };
}

function clientSnapshot() { return localStorage.getItem(APPEARANCE_STORAGE_KEY) || defaultSnapshot; }
function serverSnapshot() { return defaultSnapshot; }

export function AppearanceControls() {
  const snapshot = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  let parsed: unknown;
  try { parsed = JSON.parse(snapshot); } catch { parsed = null; }
  const preferences = isUiPreferences(parsed) ? parsed : defaultUiPreferences;
  const update = (next: UiPreferences) => saveAppearance(next);

  return <div className="ui-appearance" aria-label="Appearance preferences">
    <div className="ui-appearance__group"><span>Theme</span><div className="ui-segmented">{themeOptions.map(theme => <button type="button" key={theme} aria-pressed={preferences.theme === theme} onClick={() => update({ ...preferences, theme })}>{labels[theme]}</button>)}</div></div>
    <div className="ui-appearance__group"><span>Accent</span><div className="ui-accent-options">{accentOptions.map(accent => <button type="button" className="ui-accent-option" style={{ "--swatch": swatches[accent] } as React.CSSProperties} key={accent} aria-label={`${accent} accent`} aria-pressed={preferences.accent === accent} onClick={() => update({ ...preferences, accent })}/>)}</div></div>
    <div className="ui-appearance__group"><span>Density</span><div className="ui-segmented">{densityOptions.map(density => <button type="button" key={density} aria-pressed={preferences.density === density} onClick={() => update({ ...preferences, density })}>{labels[density]}</button>)}</div></div>
    <div className="ui-switch-row"><span><strong>Reduce motion</strong><small>Minimize nonessential transitions and animation.</small></span><button type="button" role="switch" className="ui-switch" aria-checked={preferences.reduceMotion} aria-label="Reduce motion" onClick={() => update({ ...preferences, reduceMotion: !preferences.reduceMotion })}/></div>
    <p className="ui-appearance__status" role="status">Saved on this device and applied immediately.</p>
  </div>;
}
