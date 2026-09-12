import Link from "next/link";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getOperatorHealth } from "@/lib/admin/control-centre";
export const dynamic="force-dynamic";
export default async function HealthPage(){await requireAdminPageCapability("system.read");const h=await getOperatorHealth();const items=[
  ["Consistency report","Open","Evidence and repair previews","/admin/consistency"],
  ["Background work",h.activeJobs,h.activeJobs?"Work is processing":"No queued work","/admin/jobs"],
  ["Failed work",h.failedJobs,h.failedJobs?"Needs attention":"Clear","/admin/jobs"],
  ["ICAI reviews",h.pendingReviews,h.pendingReviews?"Awaiting review":"Clear","/admin/icai-sync/data"],
  ["Notifications",h.failedNotifications,h.failedNotifications?"Delivery failures":"Clear","/admin/notifications"],
  ["Configuration drafts",h.drafts,h.drafts?"Not yet published":"None pending","/admin/control"],
  ["Active accounts",h.activeUsers,"Available","/admin/users"],
] as const;return <main style={{maxWidth:1100,margin:"0 auto",padding:"28px 22px 52px"}}><p className="eyebrow">SYSTEM HEALTH</p><h1>Operational health</h1><p>Plain-language status for routine recovery. Open an area for details and safe actions.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12,marginTop:20}}>{items.map(([label,count,state,href])=><Link href={href} key={label} style={{padding:18,border:"1px solid var(--border,#e8e5ee)",borderRadius:14,background:"var(--surface,#fff)",color:"inherit",textDecoration:"none"}}><span style={{fontSize:13}}>{label}</span><strong style={{display:"block",fontSize:28,margin:"7px 0"}}>{count}</strong><span>{state} →</span></Link>)}</div></main>}
