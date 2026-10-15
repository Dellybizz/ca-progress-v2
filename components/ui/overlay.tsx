"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

let overlayLocks=0;let unlockedOverflow="";

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };
function Overlay({ open, onClose, title, children, kind }: OverlayProps & { kind: "modal" | "drawer" | "sheet" }) {
  const effectClose=useEffectEvent(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const routeRef = useRef(pathname);
  useEffect(() => { if (routeRef.current !== pathname) { routeRef.current = pathname; if (open) effectClose(); } }, [pathname, open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if(overlayLocks===0)unlockedOverflow=document.body.style.overflow;
    overlayLocks+=1;document.body.style.overflow="hidden";
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusable()[0] ?? dialog)?.focus();
    const isTop=()=>Array.from(document.querySelectorAll('.ui-dialog[aria-modal="true"]')).at(-1)===dialog;
    const onKey = (event: KeyboardEvent) => {
      if(!isTop())return;
      if (event.key === "Escape") { event.preventDefault();event.stopPropagation();effectClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onBack = () => {if(isTop())effectClose();};
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onBack);
    return () => { overlayLocks=Math.max(0,overlayLocks-1);if(overlayLocks===0)document.body.style.overflow=unlockedOverflow; window.removeEventListener("keydown", onKey); window.removeEventListener("popstate", onBack); if(previous?.isConnected)previous.focus({preventScroll:true}); };
  }, [open]);
  if (!open) return null;
  return <div className={`ui-overlay ui-overlay--${kind}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className={`ui-dialog ui-dialog--${kind}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><div><span className="ui-dialog__eyebrow">CA Progress</span><h2 id={titleId}>{title}</h2></div><button className="ui-icon-button" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></button></header><div className="ui-dialog__body">{children}</div></section></div>;
}
export function Modal(props: OverlayProps) { return <Overlay {...props} kind="modal" />; }
export function Drawer(props: OverlayProps) { return <Overlay {...props} kind="drawer" />; }
export function BottomSheet(props: OverlayProps) { return <Overlay {...props} kind="sheet" />; }
