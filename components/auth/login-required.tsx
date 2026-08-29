import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { loginPathFor } from "@/lib/auth/navigation";

export function LoginRequired({ next, title = "Sign in to use this private feature" }: { next: string; title?: string }) {
  return <Card className="login-required"><CardBody><span className="login-required__icon"><Icon name="shield"/></span><h1>{title}</h1><p>Guest mode is available for basic surfaces, but this page stores private account data. Your destination will be restored after sign-in and onboarding.</p><Link className="ui-button ui-button--primary ui-button--lg" href={loginPathFor(next)}><span>Sign in</span><Icon name="arrow" size={16}/></Link></CardBody></Card>;
}
