import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return <div className="auth-preview"><div className="auth-preview__heading"><Badge tone="brand">Phase 1 visual preview</Badge><h2>Welcome back to focused preparation.</h2><p>Authentication is deliberately not connected until Phase 2. This screen establishes the finished interaction language only.</p></div><Card className="auth-card"><CardBody><div className="auth-actions"><Button size="lg" disabled><span className="provider-mark">G</span>Continue with Google</Button><Button size="lg" variant="secondary" disabled><Icon name="timer" size={18}/>Continue with phone</Button></div><div className="auth-divider"><span>or</span></div><Input label="Phone number preview" placeholder="+91 98765 43210" disabled hint="OTP behavior arrives in Phase 2."/><Button size="lg" variant="ghost" disabled>Continue as guest</Button><p className="auth-terms">No auth calls, sessions or production accounts are created in Phase 1.</p></CardBody></Card><EmptyState compact icon="shield" title="Identity is intentionally deferred" description="The UI is production-shaped, but Google, OTP and guest session logic remain Phase 2 work."/><Link href="/dashboard" className="ui-text-link">View the student design preview <Icon name="arrow" size={15}/></Link></div>;
}
