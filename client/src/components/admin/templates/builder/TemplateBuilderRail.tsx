import type { ReactNode } from "react";
import { Icon } from "../../../ui";
import { cx } from "../../../../lib/classNames";
import { inspectorTabs, type InspectorTab } from "./types";

type TemplateBuilderRailProps = {
  activeTab: InspectorTab;
  block: ReactNode;
  layers: ReactNode;
  onSelectTab: (tab: InspectorTab) => void;
  page: ReactNode;
  template: ReactNode;
};

export function TemplateBuilderRail({ activeTab, block, layers, onSelectTab, page, template }: TemplateBuilderRailProps) {
  const panels: Record<InspectorTab, ReactNode> = {
    block,
    layers,
    page,
    template
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="grid grid-cols-4 gap-1 rounded-md border border-slate-200 bg-slate-100/80 p-1 shadow-sm shadow-slate-900/5">
        {inspectorTabs.map((tab) => (
          <button
            className={cx(
              "inline-flex min-w-0 items-center justify-center gap-1 rounded px-2 py-2 text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
              activeTab === tab.id
                ? "bg-white text-[#061d49] shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
            )}
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            title={tab.label}
            type="button"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" name={tab.icon} />
            <span className="min-w-0 truncate">{tab.label}</span>
          </button>
        ))}
      </div>
      {panels[activeTab]}
    </div>
  );
}
