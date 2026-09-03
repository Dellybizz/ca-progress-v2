"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function shouldTrackClick(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}

function NavigationProgressState() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement && shouldTrackClick(event, anchor)) setPending(true);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return pending ? <div className="app-navigation-progress" role="status" aria-label="Loading next page" /> : null;
}

export function NavigationProgress() {
  const pathname = usePathname();
  return <NavigationProgressState key={pathname} />;
}
