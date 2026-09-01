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

export interface RepositoryPort<TQuery = unknown, TResult = unknown> {
  readonly domain: DataDomain;
  readonly provider: PersistenceProvider;
  execute(context: RepositoryContext, query: TQuery): Promise<TResult>;
}

export const DATA_DOMAINS: readonly DataDomain[] = [
  "identity","profiles","academic","progress","planner","study","resources","community","billing","icai","mentor",
] as const;

/** Phase 3 target services are ready, while production persistence/auth cutover remains deferred. */
export const CLOUD_MIGRATION_STATE = Object.freeze({
  phase: 3 as const,
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
  migrationPhase3Started: true as const,
  phase3TargetAuthenticationPrepared: true as const,
  phase3R2Prepared: true as const,
  phase3JobsPrepared: true as const,
  phase3RealtimePrepared: true as const,
  phase3ProductionActivated: false as const,
  migrationPhase4Started: false as const,
  mentorPhase3Started: false as const,
});

export type RepositoryBoundary = {
  domain: DataDomain;
  phase1Module: string;
  activeAdapter: PersistenceProvider;
  targetAdapter: PersistenceProvider;
  migrationNote: string;
};

export const PHASE_3_REPOSITORY_BOUNDARIES: readonly RepositoryBoundary[] = [
  { domain:"identity", phase1Module:"lib/auth/provider.ts + lib/auth/server.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Worker auth maps Google/LinkedIn provider subjects through auth_identities to stable application user ids; production auth remains Supabase until cutover." },
  { domain:"profiles", phase1Module:"lib/profile/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Target Worker bootstrap/profile lookup is D1-backed; active general profile persistence stays on the current DB provider until Phase 4." },
  { domain:"academic", phase1Module:"lib/academic/query.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Academic engine and Mentor Phase 2 canonical IDs stay unchanged in Phase 3." },
  { domain:"progress", phase1Module:"lib/progress/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Stable application user ownership remains unchanged; no production data move occurs." },
  { domain:"planner", phase1Module:"lib/planner/service.ts + lib/smart-planner/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Planner ownership remains the same application user id through auth provider migration." },
  { domain:"study", phase1Module:"lib/study/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Study history ownership is preserved; database cutover remains Phase 4/5 work." },
  { domain:"resources", phase1Module:"lib/resources/service.ts + lib/resources/r2.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"User resource bytes and new avatar bytes are R2-backed; metadata/database references remain provider-neutral and ownership-scoped." },
  { domain:"community", phase1Module:"lib/community/service.ts + lib/community/realtime-provider.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Browser Supabase Realtime dependency is removed; provider-neutral polling invalidates durable server-backed community state. Durable Objects are not required." },
  { domain:"billing", phase1Module:"lib/billing/service.ts + workers/billing/index.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Signed/idempotent billing service path remains synchronous; Phase 3 does not weaken payment reconciliation safety." },
  { domain:"icai", phase1Module:"lib/icai/query.ts + workers/icai-sync/sync-engine.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Cron produces an idempotent Cloudflare Queue job with a D1 execution ledger and current service-binding fallback until activation." },
  { domain:"mentor", phase1Module:"Mentor Phase 1/2 schema + academic catalog normalization", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Mentor Phase 1/2 data is preserved. No Mentor Phase 3 ingestion/job implementation is present." },
] as const;

// Historical aliases remain available to Phase 1/2 tests and documentation.
export const PHASE_2_REPOSITORY_BOUNDARIES = PHASE_3_REPOSITORY_BOUNDARIES;
export const PHASE_1_REPOSITORY_BOUNDARIES = PHASE_3_REPOSITORY_BOUNDARIES;

export const CLOUDFLARE_RUNTIME_CONTRACT = Object.freeze({
  current: {
    webWorker: "ca-progress-v2",
    resourceR2Binding: "USER_RESOURCES_R2",
    icaiServiceBinding: "ICAI_SYNC_SERVICE",
    billingServiceBinding: "BILLING_SERVICE",
    cronUtc: "30 0 * * *",
    supabaseServiceRoleRequired: true,
    productionAuthRuntime: "supabase-auth",
    productionD1Bound: false,
    productionQueueBound: false,
  },
  phase2Validation: {
    d1Binding: "DB",
    d1DatabaseName: "ca-progress-v2-phase2-local",
    config: "wrangler.d1.phase2.jsonc",
    migrationsDir: "d1/migrations",
    remoteDatabaseCreated: false,
    productionBound: false,
  },
  phase3Validation: {
    config: "wrangler.phase3.jsonc",
    d1Binding: "DB",
    d1DatabaseName: "ca-progress-v2-phase3-local",
    r2Binding: "USER_RESOURCES_R2",
    queueBinding: "BACKGROUND_JOBS",
    queueName: "ca-progress-v2-phase3-background",
    authRuntime: "cloudflare",
    durableObjectsRequired: false,
    productionBound: false,
  },
  planned: {
    d1Binding: "DB",
    d1Status: "phase_3_target_services_ready_not_production_activated",
    backgroundQueueBinding: "BACKGROUND_JOBS",
    queueStatus: "phase_3_ready_not_production_activated",
    kvStatus: "not_required",
    durableObjectsStatus: "not_required_for_current_community_invalidation_model",
    hyperdriveStatus: "optional_transition_only_not_final_data_layer",
  },
} as const);
