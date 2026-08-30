type ServiceBinding = { fetch(request: Request): Promise<Response> };
type Env = {
  BILLING_SERVICE?: ServiceBinding;
  USER_RESOURCES_R2?: unknown;
};

type AdminRole = "moderator" | "admin" | "owner" | "parent_owner";
type InternalContext = { supabaseUrl: string; serviceRole: string; userId: string };
type Operator = { userId: string; role: AdminRole };
type HealthState = "ok" | "degraded" | "not_configured";

const roleRank: Record<AdminRole, number> = { moderator: 10, admin: 20, owner: 30, parent_owner: 40 };
const validRoles = new Set<AdminRole>(["moderator", "admin", "owner", "parent_owner"]);
const assignableRoles = new Set<AdminRole>(["moderator", "admin", "owner"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "private, no-store" },
});

function requireInternal(request: Request): InternalContext {
  if (request.headers.get("x-ca-progress-internal") !== "ca-progress-v2-web") throw new Error("ADMIN_INTERNAL_ONLY");
  const supabaseUrl = request.headers.get("x-ca-progress-supabase-url")?.trim() || "";
  const serviceRole = request.headers.get("x-ca-progress-service-role")?.trim() || "";
  const userId = request.headers.get("x-ca-progress-user-id")?.trim() || "";
  if (!/^https:\/\/[^/]+$/.test(supabaseUrl) || !serviceRole) throw new Error("ADMIN_DATABASE_UNAVAILABLE");
  if (!userId) throw new Error("ADMIN_AUTH_REQUIRED");
  return { supabaseUrl, serviceRole, userId };
}

async function rest(ctx: InternalContext, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", ctx.serviceRole);
  headers.set("authorization", `Bearer ${ctx.serviceRole}`);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (response.status === 204) return null;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = null; }
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" && "message" in data && typeof (data as { message?: unknown }).message === "string"
      ? String((data as { message: string }).message)
      : `Admin database request failed (${response.status}).`;
    throw new Error(detail);
  }
  return data;
}

function rpc(ctx: InternalContext, name: string, body: Record<string, unknown>) {
  return rest(ctx, `rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

async function requireRole(ctx: InternalContext, minimum: AdminRole): Promise<Operator> {
  const data = await rest(ctx, `admin_users?user_id=eq.${encodeURIComponent(ctx.userId)}&is_active=eq.true&select=role&limit=1`);
  const rawRole = Array.isArray(data) && data[0] && typeof (data[0] as { role?: unknown }).role === "string"
    ? String((data[0] as { role: string }).role)
    : "";
  const role = validRoles.has(rawRole as AdminRole) ? rawRole as AdminRole : null;
  if (!role || roleRank[role] < roleRank[minimum]) throw new Error("ADMIN_ACCESS_DENIED");
  return { userId: ctx.userId, role };
}

function positiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value || "");
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

async function requestObject(request: Request) {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid admin request.");
  return value as Record<string, unknown>;
}

async function members(request: Request, ctx: InternalContext) {
  if (request.method === "GET") {
    const operator = await requireRole(ctx, "admin");
    const url = new URL(request.url);
    const page = positiveInt(url.searchParams.get("page"), 1);
    const limit = positiveInt(url.searchParams.get("limit"), 25, 100);
    const data = await rpc(ctx, "phase12_list_members", {
      p_actor: operator.userId,
      p_page: page,
      p_limit: limit,
      p_search: url.searchParams.get("q")?.trim() || null,
      p_role: url.searchParams.get("role")?.trim() || null,
    });
    const rows = Array.isArray(data) ? data : [];
    const totalValue = rows[0] && typeof rows[0] === "object" ? (rows[0] as { total_count?: unknown }).total_count : 0;
    const total = Number(totalValue || 0) || 0;
    return json({ rows, total, page, limit });
  }
  if (request.method === "PATCH") {
    const operator = await requireRole(ctx, "owner");
    const body = await requestObject(request);
    if (typeof body.userId !== "string" || !body.userId) throw new Error("Invalid member request.");
    if (body.action === "role") {
      if (typeof body.role !== "string" || !assignableRoles.has(body.role as AdminRole)) throw new Error("Invalid admin role.");
      return json(await rpc(ctx, "phase12_set_admin_role", {
        p_actor: operator.userId,
        p_target: body.userId,
        p_new_role: body.role,
        p_request_id: crypto.randomUUID(),
      }));
    }
    if (body.action === "active" && typeof body.active === "boolean") {
      return json(await rpc(ctx, "phase12_set_admin_active", {
        p_actor: operator.userId,
        p_target: body.userId,
        p_active: body.active,
        p_request_id: crypto.randomUUID(),
      }));
    }
    throw new Error("Invalid member action.");
  }
  return json({ error: "Method not allowed." }, 405);
}

async function platform(request: Request, ctx: InternalContext) {
  if (request.method === "GET") {
    await requireRole(ctx, "admin");
    const [flags, maintenance] = await Promise.all([
      rest(ctx, "feature_flags?select=flag_key,label,description,enabled,updated_at&order=flag_key.asc"),
      rest(ctx, "maintenance_settings?id=eq.true&select=enabled,message,starts_at,ends_at,updated_at&limit=1"),
    ]);
    return json({ flags: Array.isArray(flags) ? flags : [], maintenance: Array.isArray(maintenance) ? maintenance[0] ?? null : null });
  }
  if (request.method === "PATCH") {
    const operator = await requireRole(ctx, "owner");
    const body = await requestObject(request);
    if (body.action === "feature" && typeof body.flagKey === "string" && typeof body.enabled === "boolean") {
      return json(await rpc(ctx, "phase12_set_feature_flag", {
        p_actor: operator.userId,
        p_flag_key: body.flagKey,
        p_enabled: body.enabled,
        p_request_id: crypto.randomUUID(),
      }));
    }
    if (body.action === "maintenance" && typeof body.enabled === "boolean" && typeof body.message === "string") {
      return json(await rpc(ctx, "phase12_set_maintenance", {
        p_actor: operator.userId,
        p_enabled: body.enabled,
        p_message: body.message,
        p_starts_at: typeof body.startsAt === "string" ? body.startsAt : null,
        p_ends_at: typeof body.endsAt === "string" ? body.endsAt : null,
        p_request_id: crypto.randomUUID(),
      }));
    }
    throw new Error("Invalid platform action.");
  }
  return json({ error: "Method not allowed." }, 405);
}

async function plans(request: Request, ctx: InternalContext) {
  if (request.method === "GET") {
    await requireRole(ctx, "admin");
    const [plansData, entitlements] = await Promise.all([
      rest(ctx, "subscription_plans?select=id,tier_key,billing_cycle,name,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order&order=sort_order.asc"),
      rest(ctx, "plan_entitlements?select=plan_id,feature_key,enabled,limit_value,limit_unit,upgrade_message&order=feature_key.asc"),
    ]);
    return json({ plans: Array.isArray(plansData) ? plansData : [], entitlements: Array.isArray(entitlements) ? entitlements : [] });
  }
  if (request.method === "PATCH") {
    const operator = await requireRole(ctx, "owner");
    const body = await requestObject(request);
    if (body.action === "plan" && typeof body.planId === "string" && typeof body.checkoutEnabled === "boolean" && typeof body.active === "boolean") {
      const price = body.priceSubunits === null ? null : Number(body.priceSubunits);
      if (price !== null && (!Number.isInteger(price) || price < 0)) throw new Error("Invalid plan price.");
      return json(await rpc(ctx, "phase12_update_plan", {
        p_actor: operator.userId,
        p_plan_id: body.planId,
        p_price_subunits: price,
        p_checkout_enabled: body.checkoutEnabled,
        p_active: body.active,
        p_request_id: crypto.randomUUID(),
      }));
    }
    if (body.action === "entitlement" && typeof body.planId === "string" && typeof body.featureKey === "string" && typeof body.enabled === "boolean" && typeof body.limitUnit === "string") {
      const limit = body.limitValue === null ? null : Number(body.limitValue);
      if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw new Error("Invalid entitlement limit.");
      return json(await rpc(ctx, "phase12_update_entitlement", {
        p_actor: operator.userId,
        p_plan_id: body.planId,
        p_feature_key: body.featureKey,
        p_enabled: body.enabled,
        p_limit_value: limit,
        p_limit_unit: body.limitUnit,
        p_upgrade_message: typeof body.upgradeMessage === "string" ? body.upgradeMessage : "",
        p_request_id: crypto.randomUUID(),
      }));
    }
    throw new Error("Invalid plan action.");
  }
  return json({ error: "Method not allowed." }, 405);
}

async function notifications(request: Request, ctx: InternalContext) {
  if (request.method === "GET") {
    await requireRole(ctx, "admin");
    const data = await rest(ctx, "notification_templates?select=id,template_key,name,title,body,is_active,updated_at&order=updated_at.desc&limit=100");
    return json({ templates: Array.isArray(data) ? data : [] });
  }
  if (request.method === "POST") {
    const operator = await requireRole(ctx, "admin");
    const body = await requestObject(request);
    if (typeof body.templateKey !== "string" || typeof body.name !== "string" || typeof body.title !== "string" || typeof body.body !== "string") throw new Error("Invalid notification template.");
    return json(await rpc(ctx, "phase12_upsert_notification_template", {
      p_actor: operator.userId,
      p_id: typeof body.id === "string" ? body.id : null,
      p_template_key: body.templateKey,
      p_name: body.name,
      p_title: body.title,
      p_body: body.body,
      p_active: body.active !== false,
      p_request_id: crypto.randomUUID(),
    }), 201);
  }
  return json({ error: "Method not allowed." }, 405);
}

async function audit(request: Request, ctx: InternalContext) {
  await requireRole(ctx, "admin");
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const url = new URL(request.url);
  const page = positiveInt(url.searchParams.get("page"), 1);
  const limit = positiveInt(url.searchParams.get("limit"), 50, 100);
  const filters = [
    "select=id,actor_user_id,actor_role,action_key,entity_type,entity_id,request_id,before_state,after_state,metadata,created_at",
    "order=created_at.desc",
    `limit=${limit}`,
    `offset=${Math.max(0, (page - 1) * limit)}`,
  ];
  const action = url.searchParams.get("action")?.trim();
  const actor = url.searchParams.get("actor")?.trim();
  if (action) filters.push(`action_key=ilike.*${encodeURIComponent(action)}*`);
  if (actor) filters.push(`actor_user_id=eq.${encodeURIComponent(actor)}`);
  const data = await rest(ctx, `admin_audit_logs?${filters.join("&")}`);
  return json({ rows: Array.isArray(data) ? data : [], page, limit });
}

async function content(request: Request, ctx: InternalContext) {
  if (request.method === "GET") {
    await requireRole(ctx, "admin");
    const [versions, attempts, resources] = await Promise.all([
      rest(ctx, "syllabus_versions?select=id,subject_id,version_key,title,status,effective_from,effective_to,source_url,updated_at&order=updated_at.desc&limit=60"),
      rest(ctx, "exam_attempts?select=id,level_id,label,status,verification_status,start_date,end_date,source_url,updated_at&order=updated_at.desc&limit=60"),
      rest(ctx, "icai_resources?select=id,resource_type,title,status,verification_status,official_url,published_on,updated_at&order=updated_at.desc&limit=60"),
    ]);
    return json({ versions: Array.isArray(versions) ? versions : [], attempts: Array.isArray(attempts) ? attempts : [], resources: Array.isArray(resources) ? resources : [] });
  }
  if (request.method === "PATCH") {
    const operator = await requireRole(ctx, "admin");
    const body = await requestObject(request);
    if (!["syllabus_version", "exam_attempt", "icai_resource"].includes(String(body.entityType)) || typeof body.entityId !== "string" || typeof body.status !== "string") throw new Error("Invalid content state request.");
    return json(await rpc(ctx, "phase12_update_content_state", {
      p_actor: operator.userId,
      p_entity_type: body.entityType,
      p_entity_id: body.entityId,
      p_status: body.status,
      p_verification_status: typeof body.verificationStatus === "string" ? body.verificationStatus : null,
      p_request_id: crypto.randomUUID(),
    }));
  }
  return json({ error: "Method not allowed." }, 405);
}

async function count(ctx: InternalContext, path: string) {
  const response = await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`, {
    method: "HEAD",
    headers: { apikey: ctx.serviceRole, authorization: `Bearer ${ctx.serviceRole}`, prefer: "count=exact" },
  });
  if (!response.ok) return null;
  const total = response.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

async function billingHealth(env: Env, ctx: InternalContext) {
  if (!env.BILLING_SERVICE) return new Response(null, { status: 503 });
  return env.BILLING_SERVICE.fetch(new Request("https://billing.internal/health", {
    method: "GET",
    headers: {
      "x-ca-progress-internal": "ca-progress-v2-web",
      "x-ca-progress-supabase-url": ctx.supabaseUrl,
      "x-ca-progress-service-role": ctx.serviceRole,
      "x-ca-progress-user-id": ctx.userId,
    },
  }));
}

async function health(request: Request, env: Env, ctx: InternalContext) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const operator = await requireRole(ctx, "admin");
  const [membersCount, openReports, pendingResources, failedPayments, syncRows, paymentRows, realtime, billingResponse, authResponse] = await Promise.all([
    count(ctx, "profiles?select=user_id"),
    count(ctx, "message_reports?status=eq.open&select=id"),
    count(ctx, "uploaded_resources?moderation_status=eq.pending&select=id"),
    count(ctx, "payment_orders?status=eq.failed&select=id"),
    rest(ctx, "icai_sync_runs?select=status,started_at&order=started_at.desc&limit=1").catch(() => []),
    rest(ctx, "payment_events?select=provider_status&order=created_at.desc&limit=1").catch(() => []),
    rpc(ctx, "phase12_realtime_health", { p_actor: operator.userId }).catch(() => false),
    billingHealth(env, ctx).catch(() => new Response(null, { status: 503 })),
    fetch(`${ctx.supabaseUrl}/auth/v1/health`, { headers: { apikey: ctx.serviceRole } }).catch(() => null),
  ]);
  const storage: HealthState = env.USER_RESOURCES_R2 ? "ok" : "not_configured";
  const billing = billingResponse.ok ? await billingResponse.json().catch(() => ({})) as { providerConfigured?: boolean; webhookConfigured?: boolean } : {};
  const latestSync = Array.isArray(syncRows) ? syncRows[0] ?? null : null;
  const latestPayment = Array.isArray(paymentRows) ? paymentRows[0] ?? null : null;
  const paymentFailed = (latestPayment as { provider_status?: string } | null)?.provider_status === "failed";
  return json({
    counts: {
      members: membersCount ?? 0,
      openReports: openReports ?? 0,
      pendingResources: pendingResources ?? 0,
      failedPayments: failedPayments ?? 0,
    },
    checks: {
      database: membersCount === null ? "degraded" : "ok",
      auth: authResponse?.ok ? "ok" : "degraded",
      storage,
      realtime: realtime === true ? "ok" : "degraded",
      razorpay: billingResponse.ok ? (billing.providerConfigured && !paymentFailed ? "ok" : billing.providerConfigured ? "degraded" : "not_configured") : "degraded",
      icai: latestSync ? ((latestSync as { status?: string }).status === "failed" ? "degraded" : "ok") : "not_configured",
    } satisfies Record<string, HealthState>,
    razorpay: billing,
    icai: { latestSync },
    checkedAt: new Date().toISOString(),
  });
}

function errorStatus(message: string) {
  if (message === "ADMIN_AUTH_REQUIRED") return 401;
  if (message === "ADMIN_ACCESS_DENIED" || message === "ADMIN_INTERNAL_ONLY") return 403;
  if (message === "ADMIN_DATABASE_UNAVAILABLE" || /not connected|configuration|unavailable/i.test(message)) return 503;
  if (/invalid|must|requires/i.test(message)) return 400;
  if (/not found/i.test(message)) return 404;
  return 409;
}

const adminOpsWorker = {
  async fetch(request: Request, env: Env) {
    try {
      const ctx = requireInternal(request);
      const path = new URL(request.url).pathname;
      if (path === "/members") return await members(request, ctx);
      if (path === "/platform") return await platform(request, ctx);
      if (path === "/plans") return await plans(request, ctx);
      if (path === "/notifications") return await notifications(request, ctx);
      if (path === "/audit") return await audit(request, ctx);
      if (path === "/content") return await content(request, ctx);
      if (path === "/health") return await health(request, env, ctx);
      return json({ error: "Not found." }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin operations service failed.";
      const publicMessage = message
        .replace(/^ADMIN_AUTH_REQUIRED$/, "ADMIN_AUTH_REQUIRED")
        .replace(/^ADMIN_ACCESS_DENIED$/, "ADMIN_ACCESS_DENIED")
        .replace(/^ADMIN_INTERNAL_ONLY$/, "Admin operations service is internal only.")
        .replace(/^ADMIN_DATABASE_UNAVAILABLE$/, "V2 admin database configuration is unavailable.");
      return json({ error: publicMessage }, errorStatus(message));
    }
  },
};

export default adminOpsWorker;
