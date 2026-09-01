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
  service?: "web" | "billing" | "icai-sync" | "system" | "mentor";
};

/**
 * Provider-neutral repository contract established in Phase 1. Domain repositories
 * may expose richer typed methods, but business code must not require Supabase,
 * PostgREST, PostgreSQL, or D1 implementation types in its public contracts.
 */
export interface RepositoryPort<TQuery = unknown, TResult = unknown> {
  readonly domain: DataDomain;
  readonly provider: PersistenceProvider;
  execute(context: RepositoryContext, query: TQuery): Promise<TResult>;
}

export const DATA_DOMAINS: readonly DataDomain[] = [
  "identity","profiles","academic","progress","planner","study","resources","community","billing","icai","mentor",
] as const;

/** Phase 2 prepares D1 but deliberately leaves production on Supabase. */
export const CLOUD_MIGRATION_STATE = Object.freeze({
  phase: 2 as const,
  activePersistence: "supabase" as const,
  targetPersistence: "cloudflare-d1" as const,
  activeAuthentication: "supabase-auth" as const,
  targetAuthentication: "worker-auth" as const,
  productionDataMigrated: false as const,
  authenticationReplaced: false as const,
  d1SchemaPrepared: true as const,
  d1AuthorizationPrepared: true as const,
  d1AdapterPrepared: true as const,
  d1ProductionActivated: false as const,
  migrationPhase3Started: false as const,
  mentorPhase3Started: false as const,
});

export type RepositoryBoundary = {
  domain: DataDomain;
  phase1Module: string;
  activeAdapter: PersistenceProvider;
  targetAdapter: PersistenceProvider;
  migrationNote: string;
};

/**
 * Supabase remains the active adapter. Phase 2 now supplies a D1 schema/adapter and
 * explicit Worker authorization target without changing feature routing.
 */
export const PHASE_2_REPOSITORY_BOUNDARIES: readonly RepositoryBoundary[] = [
  { domain:"identity", phase1Module:"lib/auth/provider.ts + lib/auth/server.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Supabase Auth remains active; app_users preserves stable external identity mapping." },
  { domain:"profiles", phase1Module:"lib/profile/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"D1 profile operations derive user id from trusted session actor." },
  { domain:"academic", phase1Module:"lib/academic/query.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Academic engine and Mentor Phase 2 canonical IDs are preserved verbatim." },
  { domain:"progress", phase1Module:"lib/progress/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"RPC state transitions map to trusted Worker transactions plus progress event audit." },
  { domain:"planner", phase1Module:"lib/planner/service.ts + lib/smart-planner/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Today Plan, revision, goals and calendar schemas are prepared; no production switch." },
  { domain:"study", phase1Module:"lib/study/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Timer RPC behavior maps to actor-owned Worker transactions." },
  { domain:"resources", phase1Module:"lib/resources/service.ts + lib/resources/r2.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"R2 bytes stay in R2; D1 stores metadata and trusted authorization replaces RLS." },
  { domain:"community", phase1Module:"lib/community/service.ts + lib/community/realtime-provider.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"D1 persistence prepared; Supabase realtime remains active until a later phase." },
  { domain:"billing", phase1Module:"lib/billing/service.ts + workers/billing/index.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Payment reconciliation maps to Billing Worker service-only atomic/idempotent logic." },
  { domain:"icai", phase1Module:"lib/icai/query.ts + workers/icai-sync/sync-engine.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"ICAI sync mutations map to ICAI Worker service binding and D1 batches." },
  { domain:"mentor", phase1Module:"Mentor Phase 1/2 schema + academic catalog normalization", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Mentor Phase 1 tables and Phase 2 canonical catalog/aliases/lineage are represented; Mentor Phase 3 is not started." },
] as const;

// Backward-compatible alias for Phase-1 tests/documentation.
export const PHASE_1_REPOSITORY_BOUNDARIES = PHASE_2_REPOSITORY_BOUNDARIES;

export const CLOUDFLARE_RUNTIME_CONTRACT = Object.freeze({
  current: {
    webWorker: "ca-progress-v2",
    resourceR2Binding: "USER_RESOURCES_R2",
    icaiServiceBinding: "ICAI_SYNC_SERVICE",
    billingServiceBinding: "BILLING_SERVICE",
    cronUtc: "30 0 * * *",
    supabaseServiceRoleRequired: true,
  },
  phase2Validation: {
    d1Binding: "DB",
    d1DatabaseName: "ca-progress-v2-phase2-local",
    config: "wrangler.d1.phase2.jsonc",
    migrationsDir: "d1/migrations",
    remoteDatabaseCreated: false,
    productionBound: false,
  },
  planned: {
    d1Binding: "DB",
    d1Status: "phase_2_schema_and_adapter_ready_not_activated",
    migrationQueueBinding: "MIGRATION_QUEUE",
    queueStatus: "phase_3_if_required",
    kvStatus: "optional_not_required",
    durableObjectsStatus: "optional_realtime_or_serialization_only_if_proven_needed",
    hyperdriveStatus: "optional_transition_only_not_final_data_layer",
  },
} as const);
