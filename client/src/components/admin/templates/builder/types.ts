import type { IconName } from "../../../ui";

export type BuilderStep = "basics" | "family" | "shell" | "sections" | "workflow" | "save";
export type InspectorTab = "block" | "layers" | "page" | "template";
export type PreviewScenario = "standard" | "longBody" | "threeSignatures" | "withCc";

export const builderSteps: Array<{ id: BuilderStep; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "family", label: "Type" },
  { id: "shell", label: "Official Shell" },
  { id: "sections", label: "Editable Areas" },
  { id: "workflow", label: "Preview" },
  { id: "save", label: "Save" }
];

export const inspectorTabs: Array<{ id: InspectorTab; icon: IconName; label: string }> = [
  { id: "block", icon: "edit", label: "Block" },
  { id: "layers", icon: "hierarchy", label: "Layers" },
  { id: "page", icon: "document", label: "Page" },
  { id: "template", icon: "template", label: "Template" }
];
