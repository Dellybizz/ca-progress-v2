import "server-only";
import { cookies } from "next/headers";
export const GUEST_ID_COOKIE = "ca_guest_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function getServerGuestId() {
  const value = (await cookies()).get(GUEST_ID_COOKIE)?.value ?? "";
  return UUID.test(value) ? `guest:${value.toLowerCase()}` : null;
}
