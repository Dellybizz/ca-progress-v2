import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthServerConfig } from "@/lib/env";

export type OtpEventType = "request" | "verify";

export function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

function hashPrivateValue(value: string, salt: string) {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export async function consumeOtpRateLimit(eventType: OtpEventType, phone: string, ip: string) {
  const config = getAuthServerConfig();
  if (!config.configured) return { ok: false as const, status: 503, error: "Phone sign-in protection is not configured yet." };
  const admin = createAdminSupabaseClient();
  const phoneHash = hashPrivateValue(phone, config.rateLimitSalt);
  const ipHash = hashPrivateValue(ip, config.rateLimitSalt);
  const windowMs = 10 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const phoneLimit = eventType === "request" ? 3 : 8;
  const ipLimit = eventType === "request" ? 8 : 24;
  const [phoneResult, ipResult] = await Promise.all([
    admin.from("auth_otp_rate_limits").select("id", { count: "exact", head: true }).eq("event_type", eventType).eq("phone_hash", phoneHash).gte("requested_at", since),
    admin.from("auth_otp_rate_limits").select("id", { count: "exact", head: true }).eq("event_type", eventType).eq("ip_hash", ipHash).gte("requested_at", since),
  ]);
  if (phoneResult.error || ipResult.error) return { ok: false as const, status: 503, error: "Phone sign-in protection is temporarily unavailable." };
  if ((phoneResult.count ?? 0) >= phoneLimit || (ipResult.count ?? 0) >= ipLimit) {
    return { ok: false as const, status: 429, error: "Too many attempts. Please wait about 10 minutes and try again." };
  }
  const { error } = await admin.from("auth_otp_rate_limits").insert({ event_type: eventType, phone_hash: phoneHash, ip_hash: ipHash });
  if (error) return { ok: false as const, status: 503, error: "Phone sign-in protection is temporarily unavailable." };
  void admin.from("auth_otp_rate_limits").delete().lt("requested_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return { ok: true as const };
}
