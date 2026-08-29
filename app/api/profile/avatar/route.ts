import { NextResponse, type NextRequest } from "next/server";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to upload an avatar." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
  const extension = allowed.get(file.type);
  if (!extension || file.size <= 0 || file.size > 2 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Avatar must be a JPEG, PNG or WebP file no larger than 2 MB." }, { status: 400 });
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;
  const supabase = await createServerSupabaseClient();
  const previous = await getProfileForUser(user.id);
  const payload = new Uint8Array(await file.arrayBuffer());
  const uploaded = await supabase.storage.from("avatars").upload(path, payload, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (uploaded.error) return NextResponse.json({ ok: false, error: "Could not upload this avatar." }, { status: 500 });
  const updated = await supabase.from("profiles").update({ avatar_url: path }).eq("user_id", user.id);
  if (updated.error) {
    await supabase.storage.from("avatars").remove([path]);
    return NextResponse.json({ ok: false, error: "Could not attach the avatar to your profile." }, { status: 500 });
  }
  if (previous?.avatar_url && previous.avatar_url.startsWith(`${user.id}/`) && previous.avatar_url !== path) await supabase.storage.from("avatars").remove([previous.avatar_url]);
  const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  return NextResponse.json({ ok: true, path, signedUrl: signed.data?.signedUrl ?? null });
}
