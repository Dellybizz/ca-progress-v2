import { NextResponse } from "next/server";
import { APP_RELEASE_CONTRACT } from "@/config/app-release";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(APP_RELEASE_CONTRACT, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-CA-API-Version": String(APP_RELEASE_CONTRACT.api.current),
    },
  });
}
