"use client";

import { useState, useEffect } from "react";

interface Section {
  id: string;
  label: string;
}

export function SectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-10% 0% -80% 0%" },
    );

    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-border-subtle -mx-8 px-8 py-2 mb-6">
      <div className="flex gap-1 overflow-x-auto">
        {sections.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`px-3 py-1.5 rounded-[6px] text-[14px] whitespace-nowrap transition-colors ${
              active === id
                ? "bg-raised text-primary"
                : "text-secondary hover:text-primary"
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
