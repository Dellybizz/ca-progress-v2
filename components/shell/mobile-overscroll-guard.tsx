"use client";

import { useEffect } from "react";

function canScrollElement(element: HTMLElement, deltaY: number) {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;

  if (deltaY > 0) return element.scrollTop > 0;
  if (deltaY < 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  return false;
}

function nestedScrollerCanConsume(target: EventTarget | null, deltaY: number) {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (canScrollElement(node, deltaY)) return true;
    node = node.parentElement;
  }
  return false;
}

export function MobileOverscrollGuard() {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    let lastX = 0;
    let lastY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (!media.matches || event.touches.length !== 1) return;
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!media.matches || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const fingerDeltaX = touch.clientX - lastX;
      const fingerDeltaY = touch.clientY - lastY;
      lastX = touch.clientX;
      lastY = touch.clientY;

      if (Math.abs(fingerDeltaY) <= Math.abs(fingerDeltaX)) return;

      // Finger moving down means the page would scroll toward its top.
      // Finger moving up means the page would scroll toward its bottom.
      const scrollDeltaY = -fingerDeltaY;
      if (nestedScrollerCanConsume(event.target, scrollDeltaY)) return;

      const root = document.documentElement;
      const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      const atTop = window.scrollY <= 0;
      const atBottom = window.scrollY >= maxScroll - 1;

      if ((fingerDeltaY > 0 && atTop) || (fingerDeltaY < 0 && atBottom)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
