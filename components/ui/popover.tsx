"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

type PopoverTriggerProps = { controlsId: string; expanded: boolean };
export function Popover({ open, onClose, label, trigger, children }: { open: boolean; onClose: () => void; label: string; trigger: (props: PopoverTriggerProps) => ReactNode; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const triggerNode = triggerRef.current;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      triggerNode?.querySelector<HTMLElement>("button,[href],[tabindex]")?.focus();
    };
  }, [open, onClose]);
  return <div className="ui-popover-root" ref={rootRef}>
    <div ref={triggerRef}>{trigger({ controlsId: panelId, expanded: open })}</div>
    {open ? <section id={panelId} className="ui-popover" role="dialog" aria-label={label}>{children}</section> : null}
  </div>;
}

export type MenuItem = { id: string; label: string; disabled?: boolean; onSelect: () => void };
export function Menu({ label, trigger, items }: { label: string; trigger: (props: { open: boolean; toggle: () => void; controlsId: string }) => ReactNode; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const controls = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (current + 1) % controls.length : event.key === "ArrowUp" ? (current - 1 + controls.length) % controls.length : event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : -1;
    if (next >= 0 && controls.length) { event.preventDefault(); controls[next].focus(); }
  };
  return <Popover open={open} onClose={close} label={label} trigger={({ controlsId }) => trigger({ open, toggle: () => setOpen(value => !value), controlsId })}>
    <div className="ui-menu" role="menu" aria-label={label} ref={menuRef} onKeyDown={onKeyDown}>
      {items.map(item => <button type="button" role="menuitem" key={item.id} disabled={item.disabled} onClick={() => { item.onSelect(); close(); }}>{item.label}</button>)}
    </div>
  </Popover>;
}
