"use client";

import { useSyncExternalStore } from "react";

export const FOCUS_REFLECTION_STORAGE_KEY = "ca-progress:focus-reflection-prompt";
const CHANGE_EVENT = "ca-progress:focus-reflection-preference";

export function focusReflectionPromptEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(FOCUS_REFLECTION_STORAGE_KEY) !== "off";
}

export function saveFocusReflectionPrompt(enabled: boolean) {
  localStorage.setItem(FOCUS_REFLECTION_STORAGE_KEY, enabled ? "on" : "off");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(CHANGE_EVENT, listener); };
}

export function FocusPreferences() {
  const enabled = useSyncExternalStore(subscribe, focusReflectionPromptEnabled, () => true);
  return <div className="ui-switch-row">
    <span><strong>Reflection after Focus</strong><small>Show a quick optional reflection only when a Focus session ends.</small></span>
    <button type="button" role="switch" className="ui-switch" aria-checked={enabled} aria-label="Reflection after Focus" onClick={() => saveFocusReflectionPrompt(!enabled)}/>
  </div>;
}
