import type { CSSProperties } from "react";
import Image from "next/image";
export function Avatar({ name, src, size = 36, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  return <span className={["ui-avatar", className].filter(Boolean).join(" ")} style={{ "--avatar-size": String(size) + "px" } as CSSProperties} role="img" aria-label={name}>
    {src ? <Image src={src} alt="" aria-hidden="true" width={size} height={size} unoptimized /> : <span aria-hidden="true">{initials}</span>}
  </span>;
}
