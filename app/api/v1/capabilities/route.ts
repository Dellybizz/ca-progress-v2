import { NextResponse } from "next/server";
import { API_V1_CAPABILITIES } from "@/lib/mobile/api-v1";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(API_V1_CAPABILITIES, { headers: MOBILE_API_HEADERS });
}
