"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };
function Overlay({ open, onClose, title, children, kind }: OverlayProps & { kind: "modal" | "drawer" | "sheet" }) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const routeRef = useRef(pathname);
  useEffect(() => { if (routeRef.current !== pathname) { routeRef.current = pathname; if (open) onClose(); } }, [pathname, open, onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusable()[0] ?? dialog)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className={`ui-overlay ui-overlay--${kind}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className={`ui-dialog ui-dialog--${kind}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><div><span className="ui-dialog__eyebrow">CA Progress</span><h2 id={titleId}>{title}</h2></div><button className="ui-icon-button" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></button></header><div className="ui-dialog__body">{children}</div></section></div>;
}
export function Modal(props: OverlayProps) { return <Overlay {...props} kind="modal" />; }
export function Drawer(props: OverlayProps) { return <Overlay {...props} kind="drawer" />; }
export function BottomSheet(props: OverlayProps) { return <Overlay {...props} kind="sheet" />; }
