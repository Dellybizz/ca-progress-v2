"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { nativeReleaseDecision, type NativeReleaseDecision, type NativeReleasePlatform } from "@/lib/mobile/release-compatibility";

const NATIVE_BUILD = 1;

type ReleasePayload = { native?: Partial<Record<NativeReleasePlatform, { minimumSupported?: number; recommended?: number; storeUrl?: string | null }>> };

export function NativeUpdateGate() {
  const [decision, setDecision] = useState<NativeReleaseDecision | null>(null);
  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") return;
    try {
      const response = await fetch("/api/app-config", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json() as ReleasePayload;
      const policy = payload.native?.[platform];
      if (!policy || typeof policy.minimumSupported !== "number" || typeof policy.recommended !== "number") return;
      setDecision(nativeReleaseDecision(NATIVE_BUILD, {
        minimumSupported: policy.minimumSupported,
        recommended: policy.recommended,
        storeUrl: policy.storeUrl ?? null,
      }));
    } catch { /* The hosted app remains usable when the public manifest is temporarily unavailable. */ }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    queueMicrotask(() => void check());
    const listener = App.addListener("resume", () => void check());
    return () => { void listener.then((handle) => handle.remove()); };
  }, [check]);

  if (!decision || decision.status === "current") return null;
  if (decision.status === "required") return <div role="alertdialog" aria-modal="true" aria-labelledby="native-update-title" className="native-update-gate"><div className="ui-card"><p className="eyebrow">APP UPDATE REQUIRED</p><h1 id="native-update-title">Update CA Progress</h1><p>This installed shell is no longer compatible with the current service. Your account and cloud data are safe.</p>{decision.storeUrl?<a className="ui-button ui-button--primary" href={decision.storeUrl}>Open store</a>:<button className="ui-button ui-button--primary" type="button" onClick={() => void check()}>Check again</button>}</div></div>;
  return <aside className="native-update-notice" role="status"><span>A newer CA Progress app shell is available.</span>{decision.storeUrl?<a href={decision.storeUrl}>Update</a>:null}<button type="button" aria-label="Dismiss update notice" onClick={() => setDecision(null)}>×</button></aside>;
}
