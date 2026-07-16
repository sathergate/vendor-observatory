"use client";

import { useState, createContext, useContext, type ReactNode } from "react";

interface Section {
  id: string;
  label: string;
}

const TabContext = createContext<string>("");

export function TabbedView({
  sections,
  children,
}: {
  sections: Section[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  return (
    <TabContext.Provider value={active}>
      <nav className="sticky top-0 z-10 bg-base/95 backdrop-blur border-b border-border-subtle -mx-8 px-8 py-2 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`px-3 py-1.5 rounded-[6px] text-[14px] whitespace-nowrap transition-colors ${
                active === id
                  ? "bg-raised text-primary"
                  : "text-secondary hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      {children}
    </TabContext.Provider>
  );
}

export function TabPanel({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const active = useContext(TabContext);
  if (active !== id) return null;
  return <>{children}</>;
}
