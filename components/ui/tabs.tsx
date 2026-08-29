"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = { value: string; label: string; content: ReactNode };
export function Tabs({ items, defaultValue, ariaLabel = "Tabs" }: { items: TabItem[]; defaultValue?: string; ariaLabel?: string }) {
  const id = useId();
  const [active, setActive] = useState(defaultValue || items[0]?.value || "");
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!items.length) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    setActive(items[next].value);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  return <div className="ui-tabs"><div className="ui-tabs__list" role="tablist" aria-label={ariaLabel}>{items.map((item, index) => <button key={item.value} id={`${id}-tab-${index}`} role="tab" aria-selected={active === item.value} aria-controls={`${id}-panel-${index}`} tabIndex={active === item.value ? 0 : -1} onClick={() => setActive(item.value)} onKeyDown={(e) => onKeyDown(e, index)}>{item.label}</button>)}</div>{items.map((item, index) => <div key={item.value} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={active !== item.value} className="ui-tabs__panel">{item.content}</div>)}</div>;
}
