"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./icon";

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };
function Overlay({ open, onClose, title, children, kind }: OverlayProps & { kind: "modal" | "drawer" | "sheet" }) {
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, onClose]);
  if (!open) return null;
  return <div className={`ui-overlay ui-overlay--${kind}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`ui-dialog ui-dialog--${kind}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="ui-dialog__eyebrow">CA Progress V2</span><h2>{title}</h2></div><button className="ui-icon-button" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></button></header><div className="ui-dialog__body">{children}</div></section></div>;
}
export function Modal(props: OverlayProps) { return <Overlay {...props} kind="modal" />; }
export function Drawer(props: OverlayProps) { return <Overlay {...props} kind="drawer" />; }
export function BottomSheet(props: OverlayProps) { return <Overlay {...props} kind="sheet" />; }
