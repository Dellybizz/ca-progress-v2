import {
  requireAdmin,
  requireModerator,
  requireOwnership,
  requireService,
  requireUser,
  type TrustedActor,
} from "@/lib/data/authorization";

export type D1Result<T = unknown> = { success: boolean; results?: T[]; meta?: Record<string, unknown> };
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1Result<T>[]>;
  exec?(sql: string): Promise<unknown>;
}
export type D1Phase2Context = { actor: TrustedActor };

export type AcademicCatalogRow = {
  canonical_id: string; node_type: string; official_code: string | null; official_number: string | null;
  title: string; parent_canonical_id: string | null; subject_id: string | null; current_state: "current" | "inactive";
};
export type ProfileRow = {
  user_id: string; display_name: string | null; avatar_url: string | null; ca_level: string | null;
  group_choice: string | null; attempt_key: string | null; timezone: string; daily_target_minutes: number | null;
  onboarding_step: number; onboarding_completed_at: string | null;
};
export type ChapterProgressRow = {
  user_id: string; chapter_id: string; completed_at: string | null; revision_1_at: string | null;
  revision_2_at: string | null; test_1_at: string | null; test_2_at: string | null;
};

/** Phase-2 target adapter. It is deliberately not selected by production feature code yet. */
export class D1Phase2RepositoryAdapter {
  readonly provider = "cloudflare-d1" as const;
  constructor(private readonly db: D1DatabaseLike) {}

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<readonly T[]> {
    const result = await this.db.prepare(sql).bind(...values).all<T>();
    if (!result.success) throw new Error("D1 query failed");
    return result.results ?? [];
  }
  async execute(sql: string, values: readonly unknown[] = []): Promise<void> {
    const result = await this.db.prepare(sql).bind(...values).run();
    if (!result.success) throw new Error("D1 execution failed");
  }

  async getAcademicCatalogNode(canonicalId: string): Promise<AcademicCatalogRow | null> {
    return this.db.prepare(`SELECT canonical_id,node_type,official_code,official_number,title,parent_canonical_id,subject_id,current_state FROM academic_catalog_nodes WHERE canonical_id=?1 LIMIT 1`).bind(canonicalId).first<AcademicCatalogRow>();
  }
  async getOwnProfile(ctx: D1Phase2Context): Promise<ProfileRow | null> {
    requireUser(ctx.actor);
    return this.db.prepare(`SELECT user_id,display_name,avatar_url,ca_level,group_choice,attempt_key,timezone,daily_target_minutes,onboarding_step,onboarding_completed_at FROM profiles WHERE user_id=?1 LIMIT 1`).bind(ctx.actor.userId).first<ProfileRow>();
  }
  async getOwnChapterProgress(ctx: D1Phase2Context, chapterId: string): Promise<ChapterProgressRow | null> {
    requireUser(ctx.actor);
    return this.db.prepare(`SELECT user_id,chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1`).bind(ctx.actor.userId,chapterId).first<ChapterProgressRow>();
  }
  async saveOwnProfile(ctx: D1Phase2Context, patch: Pick<ProfileRow,"display_name"|"ca_level"|"group_choice"|"attempt_key"|"timezone"|"daily_target_minutes"|"onboarding_step"|"onboarding_completed_at">): Promise<void> {
    requireUser(ctx.actor);
    await this.execute(`INSERT INTO profiles(user_id,display_name,ca_level,group_choice,attempt_key,timezone,daily_target_minutes,onboarding_step,onboarding_completed_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,ca_level=excluded.ca_level,group_choice=excluded.group_choice,attempt_key=excluded.attempt_key,timezone=excluded.timezone,daily_target_minutes=excluded.daily_target_minutes,onboarding_step=excluded.onboarding_step,onboarding_completed_at=excluded.onboarding_completed_at,updated_at=CURRENT_TIMESTAMP`, [ctx.actor.userId,patch.display_name,patch.ca_level,patch.group_choice,patch.attempt_key,patch.timezone,patch.daily_target_minutes,patch.onboarding_step,patch.onboarding_completed_at]);
  }
  async markCommunityRead(ctx: D1Phase2Context, channelId: string, sequence: number): Promise<void> {
    requireUser(ctx.actor);
    await this.execute(`INSERT INTO channel_read_state(channel_id,user_id,last_read_sequence,last_read_at,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_sequence=MAX(channel_read_state.last_read_sequence,excluded.last_read_sequence),last_read_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, [channelId,ctx.actor.userId,sequence]);
  }
  async moderateCommunityMessage(ctx: D1Phase2Context, messageId: string, status: string): Promise<void> {
    requireModerator(ctx.actor);
    await this.execute(`UPDATE community_messages SET moderation_status=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1`, [messageId,status]);
  }
  async readOwnedSubscriptions(ctx: D1Phase2Context): Promise<readonly Record<string,unknown>[]> {
    requireUser(ctx.actor);
    return this.query(`SELECT us.*,p.tier_key,p.name AS plan_name FROM user_subscriptions us JOIN subscription_plans p ON p.id=us.plan_id WHERE us.user_id=?1 ORDER BY us.starts_at DESC`, [ctx.actor.userId]);
  }
  async reconcilePaymentServiceOnly(ctx: D1Phase2Context, statements: D1PreparedStatementLike[]): Promise<void> {
    requireService(ctx.actor,["billing"]); const results=await this.db.batch(statements); if(results.some(r=>!r.success)) throw new Error("Atomic billing batch failed");
  }
  async applyIcaiSyncServiceOnly(ctx: D1Phase2Context, statements: D1PreparedStatementLike[]): Promise<void> {
    requireService(ctx.actor,["icai-sync"]); const results=await this.db.batch(statements); if(results.some(r=>!r.success)) throw new Error("Atomic ICAI sync batch failed");
  }
  async writeMentorModelServiceOnly(ctx: D1Phase2Context, statement: D1PreparedStatementLike): Promise<void> {
    requireService(ctx.actor,["mentor","system"]); const result=await statement.run(); if(!result.success) throw new Error("Mentor model write failed");
  }
  async readPrivateSetting(ctx: D1Phase2Context,key:string):Promise<Record<string,unknown>|null>{ requireAdmin(ctx.actor); return this.db.prepare(`SELECT key,value,is_public FROM app_settings WHERE key=?1 LIMIT 1`).bind(key).first(); }
  assertOwnedRow(ctx:D1Phase2Context,persistedOwnerUserId:string):void{ requireOwnership(ctx.actor,persistedOwnerUserId); }
}
