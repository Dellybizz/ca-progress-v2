import { LoginRequired } from "@/components/auth/login-required";
import { DeleteAccountPanel } from "@/components/auth/delete-account-panel";
import { getAccountDeletionStatus } from "@/lib/auth/account-deletion";
import { optionalUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/account/delete"/>;
  const status = await getAccountDeletionStatus(user.id);
  return <DeleteAccountPanel identityLabel={user.email || user.phone || "Authenticated account"} blockedReason={status.reason}/>;
}
