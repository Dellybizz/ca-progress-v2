import type { ReactNode } from "react";
import { BottomSheet } from "./overlay";

export function FilterSheet({ open, onClose, title = "Filters", children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return <BottomSheet open={open} onClose={onClose} title={title}>{children}</BottomSheet>;
}

export function StickyActionArea({ children, label = "Page actions" }: { children: ReactNode; label?: string }) {
  return <div className="ui-sticky-actions" role="group" aria-label={label}>{children}</div>;
}

export function MobileSummary({ title, detail, meta }: { title: string; detail: string; meta?: ReactNode }) {
  return <div className="ui-mobile-summary"><strong>{title}</strong><span>{detail}</span>{meta}</div>;
}

export function Accordion({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="ui-accordion" open={open}><summary>{title}</summary><div className="ui-accordion__body">{children}</div></details>;
}
