import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function Loading() {
  return <div className="phase10-page" aria-busy="true">
    <PageHeader preview={false} eyebrow="Community" title="Community" description="Connect with other students, ask questions, and share useful resources." />
    <div className="phase10-overview-grid">
      <Card><CardBody><div className="phase10-skeleton phase10-skeleton--title" /><div className="phase10-skeleton phase10-skeleton--text" /><div className="phase10-skeleton phase10-skeleton--text phase10-skeleton--short" /></CardBody></Card>
      <Card><CardBody><div className="phase10-skeleton phase10-skeleton--title" /><div className="phase10-skeleton phase10-skeleton--text" /><div className="phase10-skeleton phase10-skeleton--text phase10-skeleton--short" /></CardBody></Card>
    </div>
    <section className="phase10-channel-groups"><div className="phase10-skeleton phase10-skeleton--heading" /><div className="phase10-channel-grid"><div className="phase10-channel-card phase10-skeleton-card" /><div className="phase10-channel-card phase10-skeleton-card" /><div className="phase10-channel-card phase10-skeleton-card" /></div></section>
  </div>;
}
