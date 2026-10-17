import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home" | "calendar" | "chart" | "timer" | "tests" | "notes" | "book"
  | "community" | "settings" | "shield" | "search" | "bell" | "more" | "close"
  | "chevron" | "arrow" | "check" | "sparkles" | "clock" | "target" | "layers"
  | "undo" | "redo" | "highlight" | "list" | "ordered-list" | "checklist" | "link" | "table" | "format" | "portrait" | "landscape" | "type" | "align-left" | "align-center" | "align-right" | "justify" | "outline" | "expand" | "image" | "equation"
  | "plus" | "sun" | "moon" | "command" | "lock" | "alert" | "cloud-off";

const paths: Record<IconName, ReactNode> = {
  undo: <><path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14"/></>,
  redo: <><path d="m16 3 5 5-5 5M21 8H11a7 7 0 0 0 0 14"/></>,
  highlight: <><path d="m9 11 7-8 5 5-8 7-4-4ZM9 11l-4 5 3 3 5-4M3 21h8"/></>,
  list: <><path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/></>,
  'ordered-list': <><path d="M10 5h11M10 12h11M10 19h11M3 3h1v5M2 8h4M2 14c0-3 5-3 4 0l-4 5h4"/></>,
  checklist: <><rect x="2" y="3" width="7" height="7" rx="1"/><path d="m3 6 2 2 3-4M13 6h8M13 18h8"/><rect x="2" y="15" width="7" height="7" rx="1"/></>,
  link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9)"/></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></>,
  format: <><path d="M4 5h16M4 12h10M4 19h7M19 10v11M15 14l4-4 4 4"/></>,
  portrait: <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  landscape: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h7M6 13h12"/></>,
  type: <><path d="M4 5h16M12 5v15M8 20h8"/></>,
  'align-left': <path d="M3 4h18M3 9h12M3 14h18M3 19h12"/>,
  'align-center': <path d="M3 4h18M6 9h12M3 14h18M6 19h12"/>,
  'align-right': <path d="M3 4h18M9 9h12M3 14h18M9 19h12"/>,
  justify: <path d="M3 4h18M3 9h18M3 14h18M3 19h18"/>,
  outline: <><path d="M9 4h12M9 12h12M9 20h12M3 4h1M3 12h1M3 20h1"/></>,
  expand: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
  equation: <><path d="M20 4H8l7 8-7 8h12M3 8h3M3 16h3"/></>,

  home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9.5 21v-6h5v6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  timer: <><circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2M9 2h6M17.5 5.5 19 4"/></>,
  tests: <><path d="M7 3h10v4H7z"/><path d="M5 5h14a2 2 0 0 1 2 2v14H3V7a2 2 0 0 1 2-2Z"/><path d="m8 13 2 2 5-5M8 18h8"/></>,
  notes: <><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 13h6M9 17h6"/></>,
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></>,
  community: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z"/><path d="m5 14 .6 1.4L7 16l-1.4.6L5 18l-.6-1.4L3 16l1.4-.6Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>,
  command: <><path d="M9 6a3 3 0 1 0-3 3h3V6ZM15 6a3 3 0 1 1 3 3h-3V6ZM9 15H6a3 3 0 1 0 3 3v-3ZM15 15h3a3 3 0 1 1-3 3v-3Z"/><path d="M9 9h6v6H9z"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  alert: <><path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  "cloud-off": <><path d="m3 3 18 18"/><path d="M16.7 16.7H6.5A4.5 4.5 0 0 1 5.8 7.8M8.7 4.6A6 6 0 0 1 18 9.5a3.5 3.5 0 0 1 2.3 5.9"/></>,
};

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
