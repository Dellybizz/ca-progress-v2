import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function PlaceholderPage({ eyebrow, title, description, stateTitle = "Surface ready for its feature phase", stateBody = "The layout and states are complete; persistent feature data is intentionally not connected yet." }: { eyebrow: string; title: string; description: string; stateTitle?: string; stateBody?: string }) {
  return <div className="product-page"><PageHeader eyebrow={eyebrow} title={title} description={description}/><EmptyState title={stateTitle} description={stateBody}/></div>;
}
