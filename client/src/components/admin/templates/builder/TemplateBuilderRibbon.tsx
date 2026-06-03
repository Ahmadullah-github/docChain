import { useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { DocumentType, EntityId, TemplateBlock, TemplateBlockStyle } from "../../../../api";
import { Icon, SelectFilter } from "../../../ui";
import type { IconName } from "../../../ui";
import { cx } from "../../../../lib/classNames";
import type { BuilderStep, PreviewScenario } from "./types";

export type TableRibbonCommand =
  | "deleteColumn"
  | "deleteRow"
  | "equalColumns"
  | "equalRows"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "insertRowAbove"
  | "insertRowBelow"
  | "mergeDown"
  | "mergeRight"
  | "splitCell";

type CommandButtonProps = {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  icon: IconName;
  onClick: () => void;
  title: string;
};

const fontFamilies = [
  "Aptos",
  "Arial",
  "Times New Roman",
  "Tahoma",
  "Noto Naskh Arabic"
];

const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 24, 32];
const textColors = ["#111827", "#061d49", "#dc2626", "#047857", "#7c3aed"];
const highlightColors = ["transparent", "#ffffff", "#fef3c7", "#dbeafe", "#dcfce7"];

function CommandButton({ active, children, disabled, icon, onClick, title }: CommandButtonProps) {
  return (
    <button
      aria-label={title}
      className={cx(
        "group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border p-0 text-xs font-bold leading-4 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        active
          ? "border-[#061d49] bg-[#061d49] text-white shadow-sm"
          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white hover:text-slate-950",
        disabled && "cursor-not-allowed opacity-45"
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon className="h-5 w-5 shrink-0" name={icon} />
      <span className="sr-only">{children}</span>
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white shadow-lg shadow-slate-900/20 group-hover:block group-focus-visible:block">
        {title}
      </span>
    </button>
  );
}

function TextCommandButton({
  active,
  children,
  className,
  disabled,
  onClick,
  title
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={cx(
        "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-2 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        active ? "border-[#061d49] bg-[#061d49] text-white" : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-white",
        disabled && "cursor-not-allowed opacity-45",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function ColorButton({
  active,
  color,
  disabled,
  label,
  onClick
}: {
  active?: boolean;
  color: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  const style = color === "transparent"
    ? {
      backgroundImage: "linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%)",
      backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
      backgroundSize: "10px 10px"
    }
    : { backgroundColor: color };

  return (
    <button
      aria-label={label}
      className={cx(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-white p-1 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        active ? "border-[#061d49] ring-2 ring-[#061d49]/10" : "border-transparent hover:border-slate-200",
        disabled && "cursor-not-allowed opacity-45"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="h-full w-full rounded-sm border border-slate-200" style={style} />
    </button>
  );
}

function CommandGroup({ children, label, wide }: { children: ReactNode; label: string; wide?: boolean }) {
  return (
    <section aria-label={label} className={cx("grid min-w-max grid-rows-[auto_1rem] gap-1 border-e border-slate-200/80 px-2", wide ? "w-max" : "")}>
      <div className="flex min-h-16 items-center gap-1.5">{children}</div>
      <span className="truncate text-center text-[10px] font-semibold text-slate-500">{label}</span>
    </section>
  );
}

function fieldValue(style: TemplateBlockStyle, key: keyof TemplateBlockStyle, fallback: string | number) {
  return style[key] ?? fallback;
}

type TemplateBuilderRibbonProps = {
  activeStep: BuilderStep;
  busy: boolean;
  canEdit: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  canPublish: boolean;
  documentTypes: DocumentType[];
  insertBlock: (type: string) => void;
  onBack: () => void;
  onDeleteSelectedBlock: () => void;
  onDuplicateSelectedBlock: () => void;
  onFitWidth: () => void;
  onImageUpload: (file: File) => void;
  onNext: () => void;
  onOpenLibrary: () => void;
  onOpenLogoPicker: () => void;
  onOpenPublish: () => void;
  onOpenSetup: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSelectDocumentType: (documentTypeId: EntityId | null) => void;
  onTableCommand: (command: TableRibbonCommand) => void;
  onUndo: () => void;
  onUpdateSelectedStyle: (next: Partial<TemplateBlockStyle>) => void;
  previewMaximized: boolean;
  redoCount: number;
  scenario: PreviewScenario;
  selectedBlock: TemplateBlock | null;
  selectedDocumentTypeId: EntityId | null;
  setActiveStep: (step: BuilderStep) => void;
  setPreviewMaximized: (value: boolean) => void;
  setScenario: (scenario: PreviewScenario) => void;
  setSettingsCollapsed: (value: boolean) => void;
  setZoom: (zoom: number) => void;
  settingsCollapsed: boolean;
  tableCommandState: {
    canDeleteColumn: boolean;
    canDeleteRow: boolean;
    canMergeDown: boolean;
    canMergeRight: boolean;
    canSplitCell: boolean;
    selectedLabel: string;
  };
  undoCount: number;
  zoom: number;
};

export function TemplateBuilderRibbon({
  activeStep,
  busy,
  canEdit,
  canGoBack,
  canGoNext,
  canPublish,
  documentTypes,
  insertBlock,
  onBack,
  onDeleteSelectedBlock,
  onDuplicateSelectedBlock,
  onFitWidth,
  onImageUpload,
  onNext,
  onOpenLibrary,
  onOpenLogoPicker,
  onOpenPublish,
  onOpenSetup,
  onRedo,
  onSave,
  onSelectDocumentType,
  onTableCommand,
  onUndo,
  onUpdateSelectedStyle,
  previewMaximized,
  redoCount,
  scenario,
  selectedBlock,
  selectedDocumentTypeId,
  setActiveStep,
  setPreviewMaximized,
  setScenario,
  setSettingsCollapsed,
  setZoom,
  settingsCollapsed,
  tableCommandState,
  undoCount,
  zoom
}: TemplateBuilderRibbonProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const selectedStyle = selectedBlock?.style || {};
  const selectedFontSize = Number(selectedStyle.fontSize || 10);
  const selectedFontWeight = String(selectedStyle.fontWeight || "400");
  const isBold = ["700", "800", "900", "bold"].includes(selectedFontWeight);
  const isItalic = selectedStyle.fontStyle === "italic";
  const isUnderlined = selectedStyle.textDecoration === "underline";
  const selectedAlign = selectedStyle.textAlign || "start";
  const typographyDisabled = !canEdit || !selectedBlock || ["image", "logo", "line", "box", "qr"].includes(selectedBlock.type);
  const selectedTable = selectedBlock?.type === "table";

  function handleImageInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onImageUpload(file);
    }
  }

  function setFontSize(next: number) {
    if (!Number.isFinite(next)) {
      return;
    }
    onUpdateSelectedStyle({ fontSize: Math.max(6, Math.min(72, Math.round(next))) });
  }

  return (
    <div className="sticky top-0 z-40 overflow-visible rounded-md border border-slate-200 bg-[#f7f9fd]/95 shadow-sm shadow-slate-900/5 backdrop-blur">
      <input
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageInput}
        ref={imageInputRef}
        type="file"
      />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-black text-[#061d49]">Template Designer</span>
          <SelectFilter
            aria-label="Document type"
            className="h-8 w-56 max-w-full rounded-md border-slate-200 bg-white py-1 text-xs"
            onChange={(event) => onSelectDocumentType(event.target.value === "all" ? null : Number(event.target.value))}
            value={selectedDocumentTypeId ? String(selectedDocumentTypeId) : "all"}
          >
            <option value="all">All document types</option>
            {documentTypes.map((documentType) => (
              <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
            ))}
          </SelectFilter>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <CommandButton icon="template" onClick={onOpenLibrary} title="Library">Library</CommandButton>
          <CommandButton disabled={busy || !canEdit} icon="save" onClick={onSave} title="Save">Save</CommandButton>
          <CommandButton disabled={busy || !canPublish} icon="view" onClick={onOpenPublish} title="Review and publish">Review</CommandButton>
        </div>
      </div>

      <div className="flex min-w-0 overflow-x-auto px-1 py-1.5">
        <CommandGroup label="Clipboard">
          <CommandButton disabled={!canEdit || undoCount <= 0} icon="export" onClick={onUndo} title="Undo">Undo</CommandButton>
          <CommandButton disabled={!canEdit || redoCount <= 0} icon="upload" onClick={onRedo} title="Redo">Redo</CommandButton>
          <CommandButton disabled={!canEdit || !selectedBlock} icon="plus" onClick={onDuplicateSelectedBlock} title="Duplicate">Duplicate</CommandButton>
          <CommandButton disabled={!canEdit || !selectedBlock} icon="x" onClick={onDeleteSelectedBlock} title="Delete">Delete</CommandButton>
        </CommandGroup>

        <CommandGroup label="Font" wide>
          <div className="grid grid-cols-[9.5rem_4.25rem] gap-1">
            <SelectFilter
              aria-label="Font family"
              className="h-8 rounded-md border-slate-200 bg-white py-1 text-xs"
              disabled={typographyDisabled}
              onChange={(event) => onUpdateSelectedStyle({ fontFamily: event.target.value })}
              value={String(fieldValue(selectedStyle, "fontFamily", "Aptos"))}
            >
              {fontFamilies.map((font) => <option key={font} value={font}>{font}</option>)}
            </SelectFilter>
            <SelectFilter
              aria-label="Font size"
              className="h-8 rounded-md border-slate-200 bg-white py-1 text-xs"
              disabled={typographyDisabled}
              onChange={(event) => setFontSize(Number(event.target.value))}
              value={String(selectedFontSize)}
            >
              {fontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </SelectFilter>
            <div className="col-span-2 flex items-center gap-1">
              <TextCommandButton active={isBold} disabled={typographyDisabled} onClick={() => onUpdateSelectedStyle({ fontWeight: isBold ? "400" : "700" })} title="Bold">B</TextCommandButton>
              <TextCommandButton active={isItalic} className="italic" disabled={typographyDisabled} onClick={() => onUpdateSelectedStyle({ fontStyle: isItalic ? "normal" : "italic" })} title="Italic">I</TextCommandButton>
              <TextCommandButton active={isUnderlined} className="underline" disabled={typographyDisabled} onClick={() => onUpdateSelectedStyle({ textDecoration: isUnderlined ? "none" : "underline" })} title="Underline">U</TextCommandButton>
              <TextCommandButton disabled={typographyDisabled} onClick={() => setFontSize(selectedFontSize - 1)} title="Decrease font size">A-</TextCommandButton>
              <TextCommandButton disabled={typographyDisabled} onClick={() => setFontSize(selectedFontSize + 1)} title="Increase font size">A+</TextCommandButton>
            </div>
          </div>
        </CommandGroup>

        <CommandGroup label="Color" wide>
          <div className="grid gap-1">
            <div className="flex items-center gap-1">
              <span className="w-8 text-[10px] font-black uppercase text-slate-500">Text</span>
              {textColors.map((color) => (
                <ColorButton active={selectedStyle.color === color} color={color} disabled={typographyDisabled} key={color} label={`Text color ${color}`} onClick={() => onUpdateSelectedStyle({ color })} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-8 text-[10px] font-black uppercase text-slate-500">Fill</span>
              {highlightColors.map((color) => (
                <ColorButton active={(selectedStyle.backgroundColor || "transparent") === color} color={color} disabled={typographyDisabled} key={color} label={`Fill color ${color}`} onClick={() => onUpdateSelectedStyle({ backgroundColor: color })} />
              ))}
            </div>
          </div>
        </CommandGroup>

        <CommandGroup label="Paragraph">
          <CommandButton active={selectedAlign === "left"} disabled={typographyDisabled} icon="alignLeft" onClick={() => onUpdateSelectedStyle({ textAlign: "left" })} title="Align left">Left</CommandButton>
          <CommandButton active={selectedAlign === "center"} disabled={typographyDisabled} icon="alignCenter" onClick={() => onUpdateSelectedStyle({ textAlign: "center" })} title="Align center">Center</CommandButton>
          <CommandButton active={selectedAlign === "right"} disabled={typographyDisabled} icon="alignRight" onClick={() => onUpdateSelectedStyle({ textAlign: "right" })} title="Align right">Right</CommandButton>
          <SelectFilter
            aria-label="Line height"
            className="h-8 w-16 rounded-md border-slate-200 bg-white py-1 text-xs"
            disabled={typographyDisabled}
            onChange={(event) => onUpdateSelectedStyle({ lineHeight: Number(event.target.value) })}
            value={String(selectedStyle.lineHeight || 1.65)}
          >
            <option value="1.15">1.15</option>
            <option value="1.35">1.35</option>
            <option value="1.65">1.65</option>
            <option value="2">2.0</option>
          </SelectFilter>
        </CommandGroup>

        <CommandGroup label="Insert">
          <CommandButton disabled={!canEdit} icon="text" onClick={() => insertBlock("text")} title="Insert text">Text</CommandButton>
          <CommandButton disabled={!canEdit} icon="document" onClick={() => insertBlock("dynamic_field")} title="Insert field">Field</CommandButton>
          <CommandButton disabled={!canEdit} icon="image" onClick={() => imageInputRef.current?.click()} title="Insert picture">Picture</CommandButton>
          <CommandButton disabled={!canEdit} icon="image" onClick={onOpenLogoPicker} title="Choose official logo">Logo</CommandButton>
          <CommandButton disabled={!canEdit} icon="table" onClick={() => insertBlock("table")} title="Insert table">Table</CommandButton>
          <CommandButton disabled={!canEdit} icon="move" onClick={() => insertBlock("line")} title="Insert line">Line</CommandButton>
          <CommandButton disabled={!canEdit} icon="fullscreen" onClick={() => insertBlock("box")} title="Insert box">Box</CommandButton>
          <CommandButton disabled={!canEdit} icon="signature" onClick={() => insertBlock("signature_zone")} title="Insert approval/signature section">Approve</CommandButton>
          <CommandButton disabled={!canEdit} icon="serial" onClick={() => insertBlock("qr")} title="Insert QR code">QR</CommandButton>
        </CommandGroup>

        <CommandGroup label="Table">
          <CommandButton disabled={!canEdit || !selectedTable} icon="plus" onClick={() => onTableCommand("insertRowAbove")} title="Row above">Row above</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable} icon="plus" onClick={() => onTableCommand("insertRowBelow")} title="Row below">Row below</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable} icon="plus" onClick={() => onTableCommand("insertColumnLeft")} title="Column left">Column left</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable} icon="plus" onClick={() => onTableCommand("insertColumnRight")} title="Column right">Column right</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable || !tableCommandState.canDeleteRow} icon="x" onClick={() => onTableCommand("deleteRow")} title="Delete row">Delete row</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable || !tableCommandState.canDeleteColumn} icon="x" onClick={() => onTableCommand("deleteColumn")} title="Delete column">Delete column</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable || !tableCommandState.canMergeRight} icon="table" onClick={() => onTableCommand("mergeRight")} title="Merge right">Merge right</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable || !tableCommandState.canMergeDown} icon="table" onClick={() => onTableCommand("mergeDown")} title="Merge down">Merge down</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable || !tableCommandState.canSplitCell} icon="reset" onClick={() => onTableCommand("splitCell")} title="Split cell">Split</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable} icon="fitWidth" onClick={() => onTableCommand("equalColumns")} title="Equal columns">Equal columns</CommandButton>
          <CommandButton disabled={!canEdit || !selectedTable} icon="fitWidth" onClick={() => onTableCommand("equalRows")} title="Equal rows">Equal rows</CommandButton>
          <span className="inline-flex h-8 min-w-16 items-center justify-center rounded-md px-2 text-[10px] font-black text-slate-500" title="Selected table cell">{tableCommandState.selectedLabel}</span>
        </CommandGroup>

        <CommandGroup label="Layout">
          <CommandButton disabled={!canGoBack} icon="export" onClick={() => { onBack(); onOpenSetup(); }} title="Previous setup step">Back</CommandButton>
          <CommandButton disabled={!canGoNext} icon="upload" onClick={() => { onNext(); onOpenSetup(); }} title="Next setup step">Next</CommandButton>
          <CommandButton active={activeStep === "family"} icon="template" onClick={() => { setActiveStep("family"); onOpenSetup(); }} title="Type setup">Type</CommandButton>
          <CommandButton active={activeStep === "shell"} icon="building" onClick={() => { setActiveStep("shell"); onOpenSetup(); }} title="Shell setup">Shell</CommandButton>
        </CommandGroup>

        <CommandGroup label="View">
          <SelectFilter aria-label="Preview scenario" className="h-8 w-32 rounded-md border-slate-200 bg-white py-1 text-xs" onChange={(event) => setScenario(event.target.value as PreviewScenario)} title="Preview scenario" value={scenario}>
            <option value="standard">Standard</option>
            <option value="longBody">Long body</option>
            <option value="threeSignatures">3 signatures</option>
            <option value="withCc">With CC</option>
          </SelectFilter>
          <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-md border border-transparent px-1 text-center text-xs font-black text-slate-500" title="Zoom level">{Math.round(zoom * 100)}%</span>
          <CommandButton icon="zoomOut" onClick={() => setZoom(Math.max(0.6, Number((zoom - 0.1).toFixed(1))))} title="Zoom out">Out</CommandButton>
          <CommandButton icon="zoomIn" onClick={() => setZoom(Math.min(1.5, Number((zoom + 0.1).toFixed(1))))} title="Zoom in">In</CommandButton>
          <CommandButton icon="fitWidth" onClick={onFitWidth} title="Fit width">Fit</CommandButton>
          <CommandButton active={previewMaximized} icon="fullscreen" onClick={() => setPreviewMaximized(!previewMaximized)} title="Wide preview">Wide</CommandButton>
          <CommandButton active={settingsCollapsed} icon="menu" onClick={() => setSettingsCollapsed(!settingsCollapsed)} title="Inspector rail">Rail</CommandButton>
        </CommandGroup>
      </div>
    </div>
  );
}
