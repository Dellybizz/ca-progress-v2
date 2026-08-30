import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { getAcademicVersionPreview } from "@/lib/academic/query";

export const dynamic = "force-dynamic";

export default async function AdminSyllabusPreviewPage() {
  const versions = await getAcademicVersionPreview();
  return <div className="academic-page academic-admin-page">
    <section className="academic-hero"><div><Badge tone="warning">Read-only admin preview</Badge><h1>Syllabus structure</h1><p>Review normalized syllabus versions and source verification before syllabus editing is introduced in a later admin phase.</p></div><div className="academic-source-chip"><Icon name="shield" size={18}/><span><strong>No editing in Phase 3</strong><small>Academic writes remain migration/service-role only.</small></span></div></section>
    <section className="academic-admin-summary"><Card><CardBody><span>Versions</span><strong>{versions.length}</strong><small>Current + historical</small></CardBody></Card><Card><CardBody><span>Historical</span><strong>{versions.filter((item) => item.status === "superseded").length}</strong><small>Retained, never overwritten</small></CardBody></Card><Card><CardBody><span>Verified sources</span><strong>{new Set(versions.map((item) => item.sourceUrl)).size}</strong><small>Official ICAI links</small></CardBody></Card></section>
    <section><div className="academic-section-heading"><div><span className="eyebrow">Version registry</span><h2>Academic versions</h2></div><Link href="/syllabus" className="ui-text-link">Open student explorer <Icon name="arrow" size={14}/></Link></div>{versions.length ? <div className="academic-version-table" role="table" aria-label="Syllabus versions"><div className="academic-version-table__head" role="row"><span>Level / subject</span><span>Version</span><span>Structure</span><span>Status</span><span>Source</span></div>{versions.map((version) => <div className="academic-version-table__row" role="row" key={version.id}><span><strong>{version.subjectTitle}</strong><small>{version.levelName} · {version.groupName}</small></span><span><strong>{version.key}</strong><small>{version.effectiveFrom}{version.effectiveTo ? ` → ${version.effectiveTo}` : " → current"}</small></span><span><strong>{version.chapterCount} chapters/units</strong><small>{version.topicCount} indexed topics</small></span><span><Badge tone={version.status === "published" ? "success" : version.status === "superseded" ? "neutral" : "info"}>{version.status}</Badge>{version.supersedesVersionId ? <small>Supersedes {version.supersedesVersionId}</small> : null}</span><span><a href={version.sourceUrl} target="_blank" rel="noreferrer">ICAI <Icon name="arrow" size={13}/></a><small>Verified {new Date(version.sourceVerifiedAt).toLocaleDateString("en-IN")}</small></span></div>)}</div> : <EmptyState icon="book" title="No academic versions" description="The normalized academic registry has no published data yet."/>}</section>
  </div>;
}
