import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export default async function LogoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : "/dashboard");
  const user = await optionalUser();
  if (!user) redirect("/login");
  const profile = await getProfileForUser(user.id);
  const label = profile?.display_name?.trim() || user.email || user.phone || "Student";

  return <div className="logout-v2">
    <Card className="logout-v2__card"><CardBody>
      <span className="logout-v2__icon"><Icon name="shield" size={28}/></span>
      <Badge tone="neutral">Account</Badge>
      <h1>Sign out of CA Progress?</h1>
      <p>You are signed in as <strong>{label}</strong>. Your synced progress and profile stay safe in your account.</p>
      <div className="logout-v2__actions">
        <Link className="ui-button ui-button--secondary ui-button--lg" href={next}>Stay signed in</Link>
        <form action="/auth/signout" method="post"><button className="ui-button ui-button--primary ui-button--lg" type="submit">Sign out <Icon name="arrow" size={16}/></button></form>
      </div>
      <small>Signing out only removes this browser session. It does not delete your account or study data.</small>
    </CardBody></Card>
  </div>;
}
