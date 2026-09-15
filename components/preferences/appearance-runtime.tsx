"use client";

import { useEffect } from "react";
import { defaultUiPreferences, isUiPreferences, type UiPreferences } from "@/lib/preferences/contract";

export const APPEARANCE_STORAGE_KEY = "ca-progress:appearance";

export function readAppearance(): UiPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null");
    return isUiPreferences(parsed) ? parsed : defaultUiPreferences;
  } catch {
    return defaultUiPreferences;
  }
}

export function applyAppearance(preferences: UiPreferences) {
  const root = document.documentElement;
  const dark = preferences.theme === "dark" || (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePreference = preferences.theme;
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
}

export function saveAppearance(preferences: UiPreferences) {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences));
  applyAppearance(preferences);
  window.dispatchEvent(new CustomEvent("ca-progress:appearance", { detail: preferences }));
}

export function AppearanceRuntime() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      const preferences = readAppearance();
      if (preferences.theme === "system") applyAppearance(preferences);
    };
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY) applyAppearance(readAppearance());
    };
    applyAppearance(readAppearance());
    media.addEventListener("change", updateSystemTheme);
    window.addEventListener("storage", syncOtherTab);
    return () => {
      media.removeEventListener("change", updateSystemTheme);
      window.removeEventListener("storage", syncOtherTab);
    };
  }, []);
  return null;
}
