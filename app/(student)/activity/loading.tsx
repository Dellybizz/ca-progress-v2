import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function Loading() {
  return <div className="phase6-page" aria-busy="true">
    <PageHeader preview={false} eyebrow="Activity" title="Your study and progress history." description="Your timeline is loading." />
    <Card><CardBody><div className="phase6-activity-list phase6-activity-list--loading">
      <div className="phase6-activity-skeleton" /><div className="phase6-activity-skeleton" /><div className="phase6-activity-skeleton" /><div className="phase6-activity-skeleton" />
    </div></CardBody></Card>
  </div>;
}
