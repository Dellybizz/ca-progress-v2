import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getBackgroundJobStatus, getOpenDeadLetters } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  await requireAdminPageCapability("jobs.read");
  const [jobs, deadLetters] = await Promise.all([getBackgroundJobStatus(), getOpenDeadLetters()]);
  const stateLabel=(value:unknown)=>String(value??"unknown").replaceAll("_"," ");
  return <main style={{ maxWidth: 1100, margin:"0 auto", padding: "28px 22px 52px" }}>
    <p className="eyebrow">BACKGROUND WORK</p>
    <h1>Background jobs</h1>
    <p>See work in progress and items that need operator attention. Technical errors are available only when expanded.</p>
    <h2>Recent jobs</h2>
    <div style={{display:"grid",gap:10}}>{jobs.length?jobs.map((job)=><article className="ui-card" style={{padding:16}} key={String(job.id)}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{stateLabel(job.job_type)}</strong><span>{stateLabel(job.status)}</span></div><p style={{fontSize:13}}>Attempt {String(job.attempts)} of {String(job.max_attempts)}</p>{job.last_error?<details><summary>Why this needs attention</summary><pre style={{whiteSpace:"pre-wrap"}}>{String(job.last_error)}</pre></details>:null}</article>):<p>No recent jobs.</p>}</div>
    <h2>Open dead letters</h2>
    <div style={{display:"grid",gap:10}}>{deadLetters.length?deadLetters.map((job)=><details className="ui-card" style={{padding:16}} key={String(job.id)}><summary><strong>{stateLabel(job.job_type)}</strong> · failed after {String(job.attempts)} attempts</summary><p>{String(job.error)}</p><small>Job {String(job.job_id)}</small></details>):<p>No failed work needs recovery.</p>}</div>
  </main>;
}
