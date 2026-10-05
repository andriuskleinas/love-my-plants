"use client";

import { useEffect, useState } from "react";

export type Section = { id: string; label: string };

/** Chips that jump between the plant page's sections; the one in view is highlighted. */
export function SectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    // A section counts as "in view" once it crosses the band just below the sticky chips.
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  function jump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  if (sections.length < 2) return null;
  return (
    <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 mt-4 bg-background/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={`flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
                active === s.id ? "border-leaf bg-leaf-soft text-leaf" : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
