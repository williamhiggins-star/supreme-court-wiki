"use client";

import { useState } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { DashboardTitleBar } from "@/components/DashboardTitleBar";
import { SectionPanels } from "@/components/SectionPanels";
import { DEFAULT_SECTION, type SectionKey } from "@/lib/dashboard2-sections";

export default function ScotusDashboard2() {
  const [active, setActive] = useState<SectionKey>(DEFAULT_SECTION);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto grid w-full min-h-0 max-w-[1600px] flex-1 grid-cols-1 gap-y-8 px-6 pb-6 pt-8 md:grid-cols-3 md:gap-x-12 md:gap-y-0 md:px-[100px] md:pb-[57px] md:pt-6">
        <SectionPanels active={active} />
      </div>
      <div className="mb-5 flex flex-col items-center gap-[35px]">
        <DashboardTitleBar active={active} onSelect={setActive} />
        <BottomTabBar active={active} onSelect={setActive} />
      </div>
    </div>
  );
}
