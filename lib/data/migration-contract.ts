export type PersistenceProvider = "supabase" | "cloudflare-d1";
export type AuthenticationProvider = "supabase-auth" | "worker-auth";

export type DataDomain =
  | "identity"
  | "profiles"
  | "academic"
  | "progress"
  | "planner"
  | "study"
  | "resources"
  | "community"
  | "billing"
  | "icai"
  | "mentor";

export type RepositoryContext = {
  actor?: {
    userId: string;
    role: "student" | "moderator" | "admin" | "owner" | "parent_owner";
  };
  service?: "web" | "billing" | "icai-sync" | "system";
};

/**
 * Provider-neutral repository contract for Phase 1. Domain repositories may expose
 * richer typed methods, but their public contract must not require Supabase client,
 * PostgREST or PostgreSQL types.
 */
export interface RepositoryPort<TQuery = unknown, TResult = unknown> {
  readonly domain: DataDomain;
  readonly provider: PersistenceProvider;
  execute(context: RepositoryContext, query: TQuery): Promise<TResult>;
}

export const DATA_DOMAINS: readonly DataDomain[] = [
  "identity",
  "profiles",
  "academic",
  "progress",
  "planner",
  "study",
  "resources",
  "community",
  "billing",
  "icai",
  "mentor",
] as const;

/**
 * Phase 1 is intentionally a non-cutover phase. These values are executable
 * guardrails for tests and future migration work; changing them is a phase gate.
 */
export const CLOUD_MIGRATION_STATE = Object.freeze({
  phase: 1 as const,
  activePersistence: "supabase" as const,
  targetPersistence: "cloudflare-d1" as const,
  activeAuthentication: "supabase-auth" as const,
  targetAuthentication: "worker-auth" as const,
  productionDataMigrated: false as const,
  authenticationReplaced: false as const,
  d1ProductionActivated: false as const,
  mentorPhase3Started: false as const,
});

export type RepositoryBoundary = {
  domain: DataDomain;
  phase1Module: string;
  activeAdapter: PersistenceProvider;
  migrationNote: string;
};

/**
 * Existing domain services remain the Supabase adapters in Phase 1. Feature/UI
 * code should depend on these domain boundaries rather than create Supabase
 * clients itself. Phase 2 supplies D1 implementations behind the same domains.
 */
export const PHASE_1_REPOSITORY_BOUNDARIES: readonly RepositoryBoundary[] = [
  { domain: "identity", phase1Module: "lib/auth/provider.ts + lib/auth/server.ts", activeAdapter: "supabase", migrationNote: "Supabase Auth remains active; route-level OAuth calls are behind the auth provider." },
  { domain: "profiles", phase1Module: "lib/profile/service.ts", activeAdapter: "supabase", migrationNote: "Profile/onboarding/avatar mutations are behind a domain service." },
  { domain: "academic", phase1Module: "lib/academic/query.ts", activeAdapter: "supabase", migrationNote: "Verified academic catalog reads remain unchanged." },
  { domain: "progress", phase1Module: "lib/progress/service.ts", activeAdapter: "supabase", migrationNote: "RPC-driven progress invariants remain unchanged." },
  { domain: "planner", phase1Module: "lib/planner/service.ts + lib/smart-planner/service.ts", activeAdapter: "supabase", migrationNote: "Planner and Today Plan remain Supabase-backed." },
  { domain: "study", phase1Module: "lib/study/service.ts", activeAdapter: "supabase", migrationNote: "Timer RPC semantics remain unchanged." },
  { domain: "resources", phase1Module: "lib/resources/service.ts + lib/resources/r2.ts", activeAdapter: "supabase", migrationNote: "Metadata/authorization remain Supabase; bytes already use R2." },
  { domain: "community", phase1Module: "lib/community/service.ts + lib/community/realtime-provider.ts", activeAdapter: "supabase", migrationNote: "Persistence/RPC/realtime remain Supabase-backed behind domain boundaries." },
  { domain: "billing", phase1Module: "lib/billing/service.ts + workers/billing/index.ts", activeAdapter: "supabase", migrationNote: "Razorpay Worker boundary is retained; DB RPCs remain Supabase-backed." },
  { domain: "icai", phase1Module: "lib/icai/query.ts + workers/icai-sync/sync-engine.ts", activeAdapter: "supabase", migrationNote: "ICAI Worker boundary is retained; sync RPCs remain Supabase-backed." },
  { domain: "mentor", phase1Module: "Supabase Mentor Phase 1/2 schema + academic catalog normalization", activeAdapter: "supabase", migrationNote: "Mentor Phase 2 is frozen; Phase 3 is not started." },
] as const;

export const CLOUDFLARE_RUNTIME_CONTRACT = Object.freeze({
  current: {
    webWorker: "ca-progress-v2",
    resourceR2Binding: "USER_RESOURCES_R2",
    icaiServiceBinding: "ICAI_SYNC_SERVICE",
    billingServiceBinding: "BILLING_SERVICE",
    cronUtc: "30 0 * * *",
    supabaseServiceRoleRequired: true,
  },
  planned: {
    d1Binding: "DB",
    d1Status: "phase_2_not_activated",
    migrationQueueBinding: "MIGRATION_QUEUE",
    queueStatus: "phase_3_if_required",
    kvStatus: "optional_not_required_in_phase_1",
    durableObjectsStatus: "optional_realtime_only_not_required_in_phase_1",
    hyperdriveStatus: "optional_transition_only_not_final_data_layer",
  },
} as const);
