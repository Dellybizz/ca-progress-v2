import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const fingerprint = process.env.ANDROID_SHA256_CERT_FINGERPRINT?.trim();
  if (!fingerprint || !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/i.test(fingerprint)) return NextResponse.json({ error: "Android app association is not configured." }, { status: 503 });
  return NextResponse.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "in.zanisheluxe.caprogress", sha256_cert_fingerprints: [fingerprint.toUpperCase()] } }], { headers: { "Cache-Control": "public, max-age=3600" } });
}
