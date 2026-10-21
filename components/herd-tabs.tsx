"use client";

import type { ReactNode } from "react";
import { PanelTabs } from "@/components/panel-tabs";

export function HerdTabs({ initialTab, herd, tree }: { initialTab: string; herd: ReactNode; tree: ReactNode }) {
  return (
    <PanelTabs
      initialTab={initialTab}
      tabs={[
        { id: "herd", label: "Herd" },
        { id: "tree", label: "Family tree" },
      ]}
      panels={{ herd, tree }}
    />
  );
}
