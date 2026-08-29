import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";

export default function OnboardingPage() {
  return <div className="auth-preview onboarding-preview"><div className="auth-preview__heading"><Badge tone="brand">Onboarding design preview</Badge><h2>A first-run flow that feels simple.</h2><p>Only the visual sequence is implemented. Course, group, attempt and target persistence belongs to Phase 2 and Phase 3.</p></div><Card className="auth-card"><CardBody><div className="onboarding-step"><span>Step 2 of 4</span><Progress value={50}/></div><div className="onboarding-question"><span className="onboarding-icon"><Icon name="layers"/></span><div><h3>Choose your CA level</h3><p>Selection pattern preview</p></div></div><div className="choice-grid"><button disabled>Foundation</button><button className="is-selected" disabled>Intermediate <Icon name="check" size={16}/></button><button disabled>Final</button></div><div className="button-row onboarding-actions"><Button variant="secondary" disabled>Back</Button><Button disabled>Continue <Icon name="arrow" size={16}/></Button></div></CardBody></Card><p className="auth-terms">Buttons are intentionally disabled so Phase 1 cannot create or mutate profile data.</p></div>;
}
