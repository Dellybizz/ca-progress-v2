export type PersistenceProvider = "supabase" | "cloudflare-d1";
export type AuthenticationProvider = "supabase-auth" | "worker-auth";

export type DataDomain =
  | "identity" | "profiles" | "academic" | "progress" | "planner" | "study" | "resources" | "community" | "billing" | "icai" | "mentor";

export type RepositoryContext = { actor?: { userId: string; role: "student" | "moderator" | "admin" | "owner" | "parent_owner"; }; service?: "web" | "billing" | "icai-sync" | "system" | "mentor"; };
export interface RepositoryPort<TQuery = unknown, TResult = unknown> { readonly domain: DataDomain; readonly provider: PersistenceProvider; execute(context: RepositoryContext, query: TQuery): Promise<TResult>; }
export const DATA_DOMAINS: readonly DataDomain[] = ["identity","profiles","academic","progress","planner","study","resources","community","billing","icai","mentor"] as const;

/** Phase 4 is a production-data shadow migration. Supabase remains production-authoritative and D1 is not the exclusive production provider. */
export const CLOUD_MIGRATION_STATE = Object.freeze({
  phase: 4 as const,
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
  migrationPhase4Started: true as const,
  phase4PipelinePrepared: true as const,
  phase4ProductionShadowMigrated: false as const,
  phase4Reconciled: false as const,
  phase4ShadowReadPrepared: true as const,
  phase4ProductionCutover: false as const,
  migrationPhase5Started: false as const,
  mentorPhase3Started: false as const,
});

export type RepositoryBoundary = { domain: DataDomain; phase1Module: string; activeAdapter: PersistenceProvider; targetAdapter: PersistenceProvider; migrationNote: string; };
export const PHASE_4_REPOSITORY_BOUNDARIES: readonly RepositoryBoundary[] = [
  { domain:"identity", phase1Module:"lib/auth/provider.ts + lib/auth/server.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Stable Supabase auth user IDs are copied to app_users/auth_identities; production auth still serves from Supabase until cutover." },
  { domain:"profiles", phase1Module:"lib/profile/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Profiles/preferences are migrated and reconciled, including active Phase 12 profile fields; production reads remain Supabase." },
  { domain:"academic", phase1Module:"lib/academic/query.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"All syllabus versions, attempts and canonical Academic Catalog IDs/applicability/aliases/lineage are preserved without normalization." },
  { domain:"progress", phase1Module:"lib/progress/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Chapter progress and immutable event history retain original IDs, chapter references and timestamps." },
  { domain:"planner", phase1Module:"lib/planner/service.ts + lib/smart-planner/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Planner events, Today Plan, revision state, tasks, goals, calendar, dashboard and forecasts are migrated and representative-user reconciled." },
  { domain:"study", phase1Module:"lib/study/service.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Study history/timer state preserve stable ownership and timestamps." },
  { domain:"resources", phase1Module:"lib/resources/service.ts + lib/resources/r2.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Metadata moves to D1; applicable Supabase Storage objects are checksummed into a rollback-safe Phase 4 R2 prefix. Existing R2 paths are not rewritten." },
  { domain:"community", phase1Module:"lib/community/service.ts + lib/community/realtime-provider.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Channels/history/replies/mentions/reactions/pins/read state/notifications/reports/blocks/moderation retain source IDs and ordering." },
  { domain:"billing", phase1Module:"lib/billing/service.ts + workers/billing/index.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Plans, entitlements, subscriptions, payment orders/events and ownership/provider references are copied and reconciled; billing production path is unchanged." },
  { domain:"icai", phase1Module:"lib/icai/query.ts + workers/icai-sync/sync-engine.ts", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"ICAI source/sync/snapshot/resource/exam/change/review/health state is copied in dependency order; scheduled production behavior is unchanged." },
  { domain:"mentor", phase1Module:"Mentor Phase 1/2 schema + academic catalog normalization", activeAdapter:"supabase", targetAdapter:"cloudflare-d1", migrationNote:"Phase 1/2 source tables migrate if present; source-absent tables are explicitly recorded as such. CA Mentor Phase 3 is not started." },
] as const;
export const PHASE_3_REPOSITORY_BOUNDARIES = PHASE_4_REPOSITORY_BOUNDARIES;
export const PHASE_2_REPOSITORY_BOUNDARIES = PHASE_4_REPOSITORY_BOUNDARIES;
export const PHASE_1_REPOSITORY_BOUNDARIES = PHASE_4_REPOSITORY_BOUNDARIES;

export const CLOUDFLARE_RUNTIME_CONTRACT = Object.freeze({
  current: { webWorker:"ca-progress-v2", resourceR2Binding:"USER_RESOURCES_R2", icaiServiceBinding:"ICAI_SYNC_SERVICE", billingServiceBinding:"BILLING_SERVICE", cronUtc:"30 0 * * *", supabaseServiceRoleRequired:true, productionAuthRuntime:"supabase-auth", productionD1Bound:false, productionQueueBound:false },
  phase2Validation: { d1Binding:"DB", d1DatabaseName:"ca-progress-v2-phase2-local", config:"wrangler.d1.phase2.jsonc", migrationsDir:"d1/migrations", remoteDatabaseCreated:false, productionBound:false },
  phase3Validation: { config:"wrangler.phase3.jsonc", d1Binding:"DB", d1DatabaseName:"ca-progress-v2-phase3-local", r2Binding:"USER_RESOURCES_R2", queueBinding:"BACKGROUND_JOBS", queueName:"ca-progress-v2-phase3-background", authRuntime:"cloudflare", durableObjectsRequired:false, productionBound:false },
  phase4Shadow: { config:"wrangler.phase4.jsonc", d1DatabaseName:"ca-progress-v2-phase4-shadow", sourcePersistence:"supabase", targetPersistence:"cloudflare-d1", productionServingProvider:"supabase", shadowComparisonFlag:"CA_PHASE4_SHADOW_READ", dualWrite:false, productionBound:false },
  planned: { d1Binding:"DB", d1Status:"phase_4_shadow_migration_not_production_cutover", backgroundQueueBinding:"BACKGROUND_JOBS", queueStatus:"phase_3_ready_not_production_activated", kvStatus:"not_required", durableObjectsStatus:"not_required_for_current_community_invalidation_model", hyperdriveStatus:"optional_transition_only_not_final_data_layer" },
} as const);
