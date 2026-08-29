import "server-only";

import { cookies } from "next/headers";

const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

export async function applyRememberDevicePreference(remember: boolean) {
  if (remember) return;
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (!AUTH_COOKIE.test(cookie.name)) continue;
    cookieStore.set(cookie.name, cookie.value, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV !== "development",
      httpOnly: false,
    });
  }
}
