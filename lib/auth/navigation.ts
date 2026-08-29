export function sanitizeReturnPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\0")) return fallback;
  try {
    const parsed = new URL(value, "https://ca-progress-v2.invalid");
    if (parsed.origin !== "https://ca-progress-v2.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPathFor(next: string) {
  return `/login?next=${encodeURIComponent(sanitizeReturnPath(next))}`;
}
