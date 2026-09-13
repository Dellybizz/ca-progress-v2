export const certificationMatrix = Object.freeze({
  levels: ["foundation", "intermediate-group-1", "intermediate-group-2", "intermediate-both", "final-group-1", "final-group-2"],
  contentStates: ["current", "future", "historical", "unmapped"],
  identities: ["guest", "new-account", "existing-account", "admin"],
  plans: ["free", "pro", "premium", "override", "grace", "cancelled"],
  networks: ["online", "slow", "offline", "reconnecting"],
  viewports: ["mobile", "desktop"],
  dataStates: ["empty", "populated", "stale", "conflicting", "failed"],
  operations: ["sync", "approval", "rollback", "migration", "plan-change"],
});

export const rolloutStages = Object.freeze([
  { key: "internal", audiencePercent: 0, minimumObservationMinutes: 30 },
  { key: "pilot", audiencePercent: 5, minimumObservationMinutes: 120 },
  { key: "limited", audiencePercent: 25, minimumObservationMinutes: 360 },
  { key: "general", audiencePercent: 100, minimumObservationMinutes: 1440 },
]);

export const promotionGates = Object.freeze({
  openCriticalConsistencyFindings: 0,
  foreignKeyViolations: 0,
  serverErrorRatePercentMax: 0.5,
  paymentMismatchCountMax: 0,
  offlineReplayFailureRatePercentMax: 1,
  p95AuthenticatedNavigationMsMax: 2500,
});

export const rollbackTriggers = Object.freeze({
  criticalConsistencyFinding: true,
  authorizationLeakage: true,
  paymentOrEntitlementMismatch: true,
  migrationIntegrityFailure: true,
  sustainedServerErrorRatePercent: 1,
  rollbackAction: "Pause expansion and roll back the web Worker to the last certified deployment; never delete user data.",
});
