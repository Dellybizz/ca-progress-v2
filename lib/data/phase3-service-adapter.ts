export type Phase3AuthRuntime = "supabase-auth" | "worker-auth";
export type Phase3StorageRuntime = "cloudflare-r2";
export type Phase3JobsRuntime = "cloudflare-queues";
export type Phase3RealtimeRuntime = "polling";

/**
 * Provider-neutral service contract for the non-relational migration surface.
 * Target services are implemented in Phase 3, but production activation remains
 * intentionally false until later migration/cutover phases.
 */
export const PHASE_3_SERVICE_ADAPTER = Object.freeze({
  production: {
    auth: "supabase-auth" as Phase3AuthRuntime,
    persistence: "supabase",
    resourceBytes: "cloudflare-r2" as Phase3StorageRuntime,
    avatarWrites: "cloudflare-r2" as Phase3StorageRuntime,
    scheduledJobs: "direct-service-binding-transition",
    communityInvalidation: "polling" as Phase3RealtimeRuntime,
  },
  target: {
    auth: "worker-auth" as Phase3AuthRuntime,
    persistence: "cloudflare-d1",
    resourceBytes: "cloudflare-r2" as Phase3StorageRuntime,
    avatarWrites: "cloudflare-r2" as Phase3StorageRuntime,
    scheduledJobs: "cloudflare-queues" as Phase3JobsRuntime,
    queueJobTypes: ["icai-sync"] as const,
    communityInvalidation: "polling" as Phase3RealtimeRuntime,
    communityDurableHistory: "cloudflare-d1",
    durableObjectsRequired: false,
    websocketCoordinationRequired: false,
  },
  invariants: {
    applicationUserIdOwnsData: true,
    providerSubjectOwnsData: false,
    emailLinksIdentities: false,
    supabaseStorageRequiredForNewWrites: false,
    supabaseRealtimeRequired: false,
    productionActivated: false,
    productionDataMigrated: false,
    phase4Started: false,
    mentorPhase3Started: false,
  },
} as const);
