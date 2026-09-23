export const APP_RELEASE_CONTRACT = Object.freeze({
  schemaVersion: 2,
  releaseSequence: 12,
  baselineCommit: "471ade75da025df51fcf98ba6740f400e10b9cae",
  web: Object.freeze({ channel: "production", version: "2026.09.23", updateMode: "hosted" }),
  api: Object.freeze({ current: 1, minimumSupported: 1 }),
  academicContext: Object.freeze({ current: 1, minimumSupported: 1 }),
  offline: Object.freeze({ current: 3, minimumSupported: 2 }),
  native: Object.freeze({
    android: Object.freeze({ minimumSupported: 1, recommended: 1, billing: "google_play_billing", checkoutReady: false, storeUrl: null }),
    ios: Object.freeze({ minimumSupported: 1, recommended: 1, billing: "apple_iap", checkoutReady: false, storeUrl: null }),
  }),
  rollout: Object.freeze({ channel: "internal", percentage: 0, rollbackSupported: true }),
});

export type AppReleaseContract = typeof APP_RELEASE_CONTRACT;
