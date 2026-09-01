import { NextResponse, type NextRequest } from "next/server";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { AvatarPersistenceError, replaceUserAvatar } from "@/lib/profile/service";

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
  const previous = await getProfileForUser(user.id);
  const payload = new Uint8Array(await file.arrayBuffer());
  try {
    const result = await replaceUserAvatar({
      userId: user.id,
      previousPath: previous?.avatar_url ?? null,
      payload,
      contentType: file.type,
      extension,
    });
    return NextResponse.json({ ok: true, path: result.path, signedUrl: result.signedUrl });
  } catch (error) {
    const message = error instanceof AvatarPersistenceError && error.stage === "attach"
      ? "Could not attach the avatar to your profile."
      : "Could not upload this avatar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
