import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Preparing your workspace" }: { label?: string }) {
  return <div className="page-loading" aria-busy="true" aria-label={label}><div className="page-loading__header"><Skeleton width={110} height={18}/><Skeleton width="min(520px, 80%)" height={42}/><Skeleton width="min(680px, 94%)" height={18}/></div><div className="page-loading__grid">{Array.from({ length: 6 }).map((_, index) => <div className="page-loading__card" key={index}><Skeleton width={44} height={44} radius={14}/><Skeleton width="58%" height={18}/><Skeleton width="85%" height={14}/><Skeleton width="100%" height={80} radius={16}/></div>)}</div></div>;
}
