"use client";

import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { CopilotUsageTab } from "@/components/copilot/copilot-usage-tab";
import { CoworkTab } from "@/components/copilot/cowork-tab";

type Tab = "m365" | "cowork";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "m365", label: "Microsoft 365 Copilot", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "cowork", label: "Copilot Cowork", icon: <Bot className="h-3.5 w-3.5" /> },
];

export default function CopilotPage() {
  const [tab, setTab] = useState<Tab>("m365");

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Copilot</h2>
        <p className="text-sm text-foreground/50 mt-0.5">
          Microsoft 365 Copilot : licences et utilisation par utilisateur (rapport Microsoft Graph). Copilot
          Cowork : consommation importée depuis l&apos;export du centre d&apos;administration (pas d&apos;API Microsoft).
        </p>
      </div>

      <div className="flex gap-1 mb-4" role="tablist">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors inline-flex items-center gap-1.5 ${
              tab === id ? "bg-primary text-white" : "text-foreground/60 hover:bg-foreground/5"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === "m365" ? <CopilotUsageTab /> : <CoworkTab />}
    </div>
  );
}
