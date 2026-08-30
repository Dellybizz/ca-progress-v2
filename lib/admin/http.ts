import "server-only";
import { NextResponse } from "next/server";

export function adminError(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed.";
  const status = message === "ADMIN_AUTH_REQUIRED" ? 401 : message === "ADMIN_ACCESS_DENIED" || /authorization|required|cannot|protected|denied|parent owner|equal or higher|self-/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /invalid|must|requires/i.test(message) ? 400 : 409;
  return NextResponse.json({ error: message.replace(/^ADMIN_AUTH_REQUIRED$/, "Sign in to continue.").replace(/^ADMIN_ACCESS_DENIED$/, "You do not have permission for this admin operation.") }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
