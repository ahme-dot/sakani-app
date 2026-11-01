"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The phone's bottom bar on a listing; it steps aside while the booking box itself is on screen. */
export default function ListingBar({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const box = document.getElementById("book");
    if (!box || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return <div className={`listing2-bar${hidden ? " is-hidden" : ""}`} aria-hidden={hidden || undefined}>{children}</div>;
}
