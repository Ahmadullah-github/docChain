import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { DocumentTemplateDetail, TemplateBlock, TemplateLayout } from "../../../api";
import { Button, Icon, IconButton, PanelCard, SearchInput, SelectFilter, StatusBadge } from "../../../components/ui";
import { InspectorSection, TemplateBuilderRail, commonDynamicFields, quickFillColors, quickFontSizes, quickTextColors, scenarioValues, templateFieldPrefix, type InspectorTab } from "../../../components/admin/templates/builder";
import { cx } from "../../../lib/classNames";
import { blockLabel, dynamicFieldLabel, imagePreviewSource, resolveTextAlign } from "./TemplatePreview";
import { clampNumber, colorInputValue, textAlignOptions, type EditorSettings, type PhysicalTextAlign } from "./templateBuilderModel";
import {
  canMergeTableCellDown,
  canMergeTableCellRight,
  clampTableSelection,
  deleteTableColumn,
  deleteTableRow,
  deleteTableTrackSize,
  equalTableTrackSizes,
  insertTableColumn,
  insertTableRow,
  insertTableTrackSize,
  mergeTableCellDown,
  mergeTableCellRight,
  normalizeTableRows,
  normalizeTableTrackSizes,
  serializeTableRows,
  splitTableCell,
  tableCell,
  updateTableCell
} from "../templateTableUtils";
import type { CellCoordinate, NormalizedTableCell, TableEditResult } from "../templateTableUtils";

export function DesignerRail({
  activeInspectorTab,
  canEdit,
  clearAllBlocks,
  description,
  detail,
  duplicateSelectedBlock,
  editorSettings,
  isLegacy,
  layout,
  name,
  onArchiveTemplate,
  onOpenLogoPicker,
  onOpenSetup,
  onSave,
  onSelectBlock,
  onSelectTab,
  onUpdateEditorSettings,
  onUpdateLayout,
  removeSelectedBlock,
  reorderSelectedBlock,
  selectedBlock,
  selectedBlockId,
  selectedCell,
  setBlock,
  setDescription,
  setSelectedCell,
  setName,
  toggleSelectedBlockLock,
  undoCount,
  redoCount
}: {
  activeInspectorTab: InspectorTab;
  canEdit: boolean;
  clearAllBlocks: () => void;
  description: string;
  detail: DocumentTemplateDetail | null;
  duplicateSelectedBlock: () => void;
  editorSettings: EditorSettings;
  isLegacy: boolean;
  layout: TemplateLayout;
  name: string;
  onArchiveTemplate: () => void;
  onOpenLogoPicker: () => void;
  onOpenSetup: () => void;
  onSave: () => void;
  onSelectBlock: (blockId: string | null) => void;
  onSelectTab: (tab: InspectorTab) => void;
  onUpdateEditorSettings: (settings: Partial<EditorSettings>) => void;
  onUpdateLayout: (updater: (current: TemplateLayout) => TemplateLayout) => void;
  removeSelectedBlock: () => void;
  reorderSelectedBlock: (mode: "back" | "backward" | "forward" | "front") => void;
  selectedBlock: TemplateBlock | null;
  selectedBlockId: string | null;
  selectedCell: CellCoordinate;
  setBlock: (block: TemplateBlock) => void;
  setDescription: (value: string) => void;
  setSelectedCell: (cell: CellCoordinate) => void;
  setName: (value: string) => void;
  toggleSelectedBlockLock: () => void;
  undoCount: number;
  redoCount: number;
}) {
  return (
    <TemplateBuilderRail
      activeTab={activeInspectorTab}
      block={(
        <SelectedBlockInspector
          canEdit={canEdit}
          clearAllBlocks={clearAllBlocks}
          duplicateSelectedBlock={duplicateSelectedBlock}
          pageDirection={layout.page.direction}
          removeSelectedBlock={removeSelectedBlock}
          reorderSelectedBlock={reorderSelectedBlock}
          selectedCell={selectedCell}
          selectedBlock={selectedBlock}
          setBlock={setBlock}
          setSelectedCell={setSelectedCell}
          onOpenLogoPicker={onOpenLogoPicker}
          toggleSelectedBlockLock={toggleSelectedBlockLock}
        />
      )}
      layers={(
        <LayersInspector
          canEdit={canEdit}
          clearAllBlocks={clearAllBlocks}
          duplicateSelectedBlock={duplicateSelectedBlock}
          layout={layout}
          onSelectBlock={onSelectBlock}
          removeSelectedBlock={removeSelectedBlock}
          reorderSelectedBlock={reorderSelectedBlock}
          selectedBlock={selectedBlock}
          selectedBlockId={selectedBlockId}
          setBlock={setBlock}
        />
      )}
      onSelectTab={onSelectTab}
      page={(
        <PageInspector
          canEdit={canEdit}
          editorSettings={editorSettings}
          layout={layout}
          onUpdateEditorSettings={onUpdateEditorSettings}
          onUpdateLayout={onUpdateLayout}
        />
      )}
      template={(
        <TemplateInspector
          canEdit={canEdit}
          clearAllBlocks={clearAllBlocks}
          description={description}
          detail={detail}
          isLegacy={isLegacy}
          name={name}
          onArchiveTemplate={onArchiveTemplate}
          onOpenSetup={onOpenSetup}
          onSave={onSave}
          redoCount={redoCount}
          setDescription={setDescription}
          setName={setName}
          undoCount={undoCount}
        />
      )}
    />
  );
}

function WordControlButton({
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
      className={cx(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        active ? "border-[#061d49] bg-[#061d49] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-50",
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

function ColorSwatchButton({
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
  const swatchStyle: CSSProperties = color === "transparent"
    ? { backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0", backgroundSize: "12px 12px" }
    : { backgroundColor: color };

  return (
    <button
      aria-label={label}
      className={cx(
        "grid h-8 w-8 place-items-center rounded-md border bg-white p-1 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        active ? "border-[#061d49] ring-2 ring-[#061d49]/10" : "border-slate-200 hover:border-slate-300",
        disabled && "cursor-not-allowed opacity-50"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="h-full w-full rounded-sm border border-slate-200" style={swatchStyle} />
    </button>
  );
}

function SelectedBlockInspector({
  canEdit,
  clearAllBlocks,
  duplicateSelectedBlock,
  onOpenLogoPicker,
  pageDirection,
  removeSelectedBlock,
  reorderSelectedBlock,
  selectedCell,
  selectedBlock,
  setBlock,
  setSelectedCell,
  toggleSelectedBlockLock
}: {
  canEdit: boolean;
  clearAllBlocks: () => void;
  duplicateSelectedBlock: () => void;
  onOpenLogoPicker: () => void;
  pageDirection: TemplateLayout["page"]["direction"];
  removeSelectedBlock: () => void;
  reorderSelectedBlock: (mode: "back" | "backward" | "forward" | "front") => void;
  selectedCell: CellCoordinate;
  selectedBlock: TemplateBlock | null;
  setBlock: (block: TemplateBlock) => void;
  setSelectedCell: (cell: CellCoordinate) => void;
  toggleSelectedBlockLock: () => void;
}) {
  if (!selectedBlock) {
    return (
      <PanelCard
        title="Selection"
        actions={<Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="x" onClick={clearAllBlocks} variant="danger">Clear</Button>}
      >
        <p className="text-sm leading-6 text-slate-600">Select a block on the page to edit content, position, layer order, table cells, or layout details.</p>
      </PanelCard>
    );
  }

  const layoutLocked = Boolean(selectedBlock.locked);
  const blockCanEdit = canEdit;

  function updateSelectedBlock(next: Partial<TemplateBlock>) {
    if (!selectedBlock || !blockCanEdit) {
      return;
    }
    setBlock({ ...selectedBlock, ...next });
  }

  function updateStyle(next: Partial<NonNullable<TemplateBlock["style"]>>) {
    if (!selectedBlock) {
      return;
    }
    updateSelectedBlock({ style: { ...selectedBlock.style, ...next } });
  }

  const selectedStyle = selectedBlock.style || {};
  const fontSize = Number(selectedStyle.fontSize || 10);
  const fontWeight = String(selectedStyle.fontWeight || "400");
  const isBold = ["700", "800", "900", "bold"].includes(fontWeight);
  const isItalic = selectedStyle.fontStyle === "italic";
  const isUnderlined = selectedStyle.textDecoration === "underline";
  const currentTextColor = selectedStyle.color || "#111827";
  const currentFillColor = selectedStyle.backgroundColor || "transparent";
  const supportsTextContent = ["text", "rich_text", "watermark", "cc_list"].includes(selectedBlock.type);
  const supportsTypography = !["image", "logo", "line", "box", "qr", "table"].includes(selectedBlock.type);
  const blockBadges = [
    selectedBlock.type.replaceAll("_", " "),
    layoutLocked ? "preset shell" : "editable",
    selectedBlock.hidden ? "hidden" : "",
    selectedBlock.locked ? "locked" : ""
  ].filter(Boolean);

  function setFontSize(nextSize: number) {
    updateStyle({ fontSize: clampNumber(Math.round(nextSize), 6, 72) });
  }

  return (
    <PanelCard
      bodyClassName="space-y-3 p-3"
      headerClassName="px-3 py-2"
      title="Block"
      actions={layoutLocked ? <StatusBadge tone="slate">preset</StatusBadge> : <StatusBadge tone="blue">selected</StatusBadge>}
    >
      <div className="rounded-md border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-2">
        <p className="truncate text-sm font-black text-slate-950">{blockLabel(selectedBlock)}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {blockBadges.map((badge) => (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500" key={badge}>{badge}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-1">
        <IconButton className="h-8 w-8 rounded-md" disabled={!blockCanEdit} icon="plus" label="Duplicate block" onClick={duplicateSelectedBlock} />
        <IconButton className="h-8 w-8 rounded-md" disabled={!canEdit} icon="lock" label={layoutLocked ? "Unset preset" : "Mark preset"} onClick={toggleSelectedBlockLock} />
        <IconButton className="h-8 w-8 rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-100" disabled={!blockCanEdit} icon="x" label="Delete block" onClick={removeSelectedBlock} />
        <span className="ms-auto rounded bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
          Whole block
        </span>
      </div>

      <InspectorSection title={selectedBlock.type === "line" ? "Line" : selectedBlock.type === "box" ? "Shape" : "Content"}>
        {selectedBlock.type === "line" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-5">
              <span
                className="block w-full"
                style={{
                  borderTop: `${Math.max(1, Number(selectedStyle.borderWidth || 1))}px ${selectedStyle.borderStyle || "solid"} ${selectedStyle.borderColor || "#0f172a"}`
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-bold text-slate-600">
                Stroke
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} min={1} onChange={(event) => updateStyle({ borderWidth: Number(event.target.value) })} type="number" value={selectedStyle.borderWidth || 1} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Color
                <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateStyle({ borderColor: event.target.value })} type="color" value={selectedStyle.borderColor || "#0f172a"} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Style
                <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => updateStyle({ borderStyle: event.target.value })} value={selectedStyle.borderStyle || "solid"}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </SelectFilter>
              </label>
            </div>
          </div>
        ) : selectedBlock.type === "box" ? (
          <div className="space-y-3">
            <div
              className="h-20 rounded-md"
              style={{
                backgroundColor: selectedStyle.backgroundColor || "transparent",
                border: `${Math.max(1, Number(selectedStyle.borderWidth || 1))}px ${selectedStyle.borderStyle || "solid"} ${selectedStyle.borderColor || "#94a3b8"}`
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-slate-600">
                Border
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} min={0} onChange={(event) => updateStyle({ borderWidth: Number(event.target.value) })} type="number" value={selectedStyle.borderWidth || 1} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Border color
                <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateStyle({ borderColor: event.target.value })} type="color" value={selectedStyle.borderColor || "#94a3b8"} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Fill
                <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateStyle({ backgroundColor: event.target.value })} type="color" value={colorInputValue(selectedStyle.backgroundColor, "#ffffff")} />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Style
                <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => updateStyle({ borderStyle: event.target.value })} value={selectedStyle.borderStyle || "solid"}>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </SelectFilter>
              </label>
            </div>
          </div>
        ) : selectedBlock.type === "table" ? (
          <TableBlockEditor
            canEdit={blockCanEdit}
            blockItem={selectedBlock}
            pageDirection={pageDirection}
            selectedCell={selectedCell}
            setBlock={setBlock}
            setSelectedCell={setSelectedCell}
          />
        ) : (
          <div className="space-y-3">
            {selectedBlock.type === "dynamic_field" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {commonDynamicFields.map((field) => (
                    <button
                      className={cx(
                        "rounded-md border px-2 py-1 text-[11px] font-bold transition",
                        selectedBlock.field === field ? "border-[#061d49] bg-blue-50 text-[#061d49]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                      disabled={!canEdit}
                      key={field}
                      onClick={() => updateSelectedBlock({ field })}
                      type="button"
                    >
                      {dynamicFieldLabel(field)}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-bold text-slate-600">
                  Field
                  <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => updateSelectedBlock({ field: event.target.value })} value={selectedBlock.field || "document.subject"}>
                    {Object.keys(scenarioValues.standard).map((field) => <option key={field} value={field}>{dynamicFieldLabel(field)} - {field}</option>)}
                  </SelectFilter>
                </label>
                {selectedBlock.field?.startsWith(templateFieldPrefix) ? (
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <label className="text-xs font-bold text-slate-600">
                      Lines
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} max={6} min={1} onChange={(event) => updateSelectedBlock({ maxLines: Number(event.target.value) })} type="number" value={selectedBlock.maxLines || 3} />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Min font
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} max={24} min={6} onChange={(event) => updateSelectedBlock({ minFontSize: Number(event.target.value) })} type="number" value={selectedBlock.minFontSize || 7} />
                    </label>
                    <label className="flex items-end gap-2 text-xs font-bold text-slate-600">
                      <input className="mb-3 h-4 w-4 rounded border-slate-300" checked={Boolean(selectedBlock.reflowBelow)} disabled={!canEdit} onChange={(event) => updateSelectedBlock({ reflowBelow: event.target.checked })} type="checkbox" />
                      Reflow
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {supportsTextContent ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">{selectedBlock.type.replaceAll("_", " ")}</span>
                  <span className="text-[11px] font-semibold text-slate-400">{(selectedBlock.content || "").length} chars</span>
                </div>
                <textarea
                  className="min-h-28 w-full resize-y border-0 px-3 py-3 text-sm leading-6 outline-none focus:ring-0"
                  dir="auto"
                  disabled={!canEdit}
                  onChange={(event) => updateSelectedBlock({ content: event.target.value })}
                  placeholder="Write block content..."
                  value={selectedBlock.content || ""}
                />
              </div>
            ) : null}

            {["image", "logo"].includes(selectedBlock.type) ? (
              <div className="space-y-3">
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  {imagePreviewSource(selectedBlock) ? (
                    <img alt="" className="max-h-28 max-w-full object-contain" src={imagePreviewSource(selectedBlock)} />
                  ) : (
                    <div className="text-center">
                      <Icon className="mx-auto h-6 w-6 text-slate-400" name="image" />
                      <p className="mt-2 text-xs font-bold text-slate-500">No logo selected</p>
                    </div>
                  )}
                </div>
                {selectedBlock.assetName ? <p className="truncate text-xs font-semibold text-slate-500">{selectedBlock.assetName}</p> : null}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button className="min-h-8 px-2 py-1 text-xs" disabled={!blockCanEdit} icon="image" onClick={onOpenLogoPicker}>Choose logo</Button>
                  <Button className="min-h-8 px-2 py-1 text-xs" disabled={!blockCanEdit || (!selectedBlock.src && !selectedBlock.assetId)} icon="x" onClick={() => updateSelectedBlock({ assetId: undefined, assetName: undefined, src: "" })}>Remove</Button>
                </div>
                <label className="block text-xs font-bold text-slate-600">
                  Manual image URL
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={!canEdit}
                    onChange={(event) => updateSelectedBlock({ assetId: undefined, assetName: undefined, src: event.target.value })}
                    placeholder="https://... or data:image/..."
                    value={selectedBlock.assetId ? "" : selectedBlock.src || ""}
                  />
                </label>
              </div>
            ) : null}

            {!supportsTextContent && selectedBlock.type !== "dynamic_field" && !["image", "logo", "table", "box", "line"].includes(selectedBlock.type) ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                This block has no direct text content.
              </div>
            ) : null}
          </div>
        )}
      </InspectorSection>

      {supportsTypography ? (
        <InspectorSection title="Typography">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
              <WordControlButton disabled={!canEdit} onClick={() => setFontSize(fontSize - 1)} title="Decrease font size">-</WordControlButton>
              <input
                className="h-8 w-14 rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-black text-slate-900"
                disabled={!canEdit}
                max={72}
                min={6}
                onChange={(event) => setFontSize(Number(event.target.value))}
                type="number"
                value={fontSize}
              />
              <WordControlButton disabled={!canEdit} onClick={() => setFontSize(fontSize + 1)} title="Increase font size">+</WordControlButton>
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <WordControlButton active={isBold} disabled={!canEdit} onClick={() => updateStyle({ fontWeight: isBold ? "400" : "700" })} title="Bold">B</WordControlButton>
              <WordControlButton active={isItalic} className="italic" disabled={!canEdit} onClick={() => updateStyle({ fontStyle: isItalic ? "normal" : "italic" })} title="Italic">I</WordControlButton>
              <WordControlButton active={isUnderlined} className="underline" disabled={!canEdit} onClick={() => updateStyle({ textDecoration: isUnderlined ? "none" : "underline" })} title="Underline">U</WordControlButton>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {quickFontSizes.map((size) => (
                <WordControlButton active={fontSize === size} disabled={!canEdit} key={size} onClick={() => setFontSize(size)} title={`Font size ${size}`}>
                  {size}
                </WordControlButton>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {textAlignOptions.map(({ align, icon, label }) => (
                <button
                  className={cx(
                    "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-bold",
                    resolveTextAlign(selectedStyle.textAlign, pageDirection) === align ? "border-[#061d49] bg-blue-50 text-[#061d49]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                  disabled={!canEdit}
                  key={align}
                  onClick={() => updateStyle({ textAlign: align })}
                  type="button"
                >
                  <Icon className="h-4 w-4" name={icon} />
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 text-[11px] font-black uppercase tracking-wide text-slate-500">Text</span>
                {quickTextColors.map((color) => (
                  <ColorSwatchButton active={currentTextColor === color} color={color} disabled={!canEdit} key={color} label={`Text color ${color}`} onClick={() => updateStyle({ color })} />
                ))}
                <input className="h-8 w-8 rounded-md border border-slate-200 bg-white p-1" disabled={!canEdit} onChange={(event) => updateStyle({ color: event.target.value })} title="Custom text color" type="color" value={colorInputValue(currentTextColor, "#111827")} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 text-[11px] font-black uppercase tracking-wide text-slate-500">Fill</span>
                {quickFillColors.map((color) => (
                  <ColorSwatchButton active={currentFillColor === color} color={color} disabled={!canEdit} key={color} label={`Fill color ${color}`} onClick={() => updateStyle({ backgroundColor: color })} />
                ))}
                <input className="h-8 w-8 rounded-md border border-slate-200 bg-white p-1" disabled={!canEdit} onChange={(event) => updateStyle({ backgroundColor: event.target.value })} title="Custom fill color" type="color" value={colorInputValue(currentFillColor, "#ffffff")} />
              </div>
            </div>
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection defaultOpen={false} title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label className="text-xs font-bold text-slate-600" key={key}>
              {key.toUpperCase()} mm
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canEdit}
                min={key === "width" || key === "height" ? 1 : 0}
                onChange={(event) => updateSelectedBlock({ [key]: Number(event.target.value) } as Partial<TemplateBlock>)}
                type="number"
                value={selectedBlock[key]}
              />
            </label>
          ))}
        </div>
      </InspectorSection>

      {!["box", "line"].includes(selectedBlock.type) ? (
        <InspectorSection title="Appearance" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-slate-600">
              Border
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => updateStyle({ borderWidth: Number(event.target.value) })} type="number" value={selectedBlock.style?.borderWidth || 0} />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Border color
              <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateStyle({ borderColor: event.target.value })} type="color" value={selectedBlock.style?.borderColor || "#94a3b8"} />
            </label>
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection defaultOpen={false} title="Actions">
        <div className="grid grid-cols-4 gap-1.5">
          <Button className="min-h-8 px-1.5 py-1 text-xs" disabled={!canEdit} icon="export" onClick={() => reorderSelectedBlock("back")}>Back</Button>
          <Button className="min-h-8 px-1.5 py-1 text-xs" disabled={!canEdit} icon="export" onClick={() => reorderSelectedBlock("backward")}>Down</Button>
          <Button className="min-h-8 px-1.5 py-1 text-xs" disabled={!canEdit} icon="upload" onClick={() => reorderSelectedBlock("forward")}>Up</Button>
          <Button className="min-h-8 px-1.5 py-1 text-xs" disabled={!canEdit} icon="upload" onClick={() => reorderSelectedBlock("front")}>Front</Button>
        </div>
        <Button className="w-full min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="x" onClick={clearAllBlocks} variant="danger">Clear all blocks</Button>
      </InspectorSection>

      <InspectorSection title="Advanced" defaultOpen={false}>
        <label className="block text-xs font-bold text-slate-600">
          Type
          <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => updateSelectedBlock({ type: event.target.value })} value={selectedBlock.type}>
            {["text", "rich_text", "dynamic_field", "image", "logo", "box", "line", "table", "signature_zone", "comments_zone", "cc_list", "qr", "watermark", "page_number"].map((type) => (
              <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
            ))}
          </SelectFilter>
        </label>
      </InspectorSection>
    </PanelCard>
  );
}

function LayersInspector({
  canEdit,
  clearAllBlocks,
  duplicateSelectedBlock,
  layout,
  onSelectBlock,
  removeSelectedBlock,
  reorderSelectedBlock,
  selectedBlock,
  selectedBlockId,
  setBlock
}: {
  canEdit: boolean;
  clearAllBlocks: () => void;
  duplicateSelectedBlock: () => void;
  layout: TemplateLayout;
  onSelectBlock: (blockId: string | null) => void;
  removeSelectedBlock: () => void;
  reorderSelectedBlock: (mode: "back" | "backward" | "forward" | "front") => void;
  selectedBlock: TemplateBlock | null;
  selectedBlockId: string | null;
  setBlock: (block: TemplateBlock) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBlocks = normalizedQuery
    ? layout.blocks.filter((blockItem) => `${blockLabel(blockItem)} ${blockItem.type}`.toLowerCase().includes(normalizedQuery))
    : layout.blocks;

  return (
    <PanelCard
      bodyClassName="space-y-3 p-3"
      title="Layers"
      actions={<StatusBadge tone="slate">{String(layout.blocks.length)}</StatusBadge>}
    >
      <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search blocks..." value={query} />

      <div className="max-h-[28rem] space-y-1 overflow-y-auto pe-1">
        {visibleBlocks.length ? visibleBlocks.map((blockItem, index) => (
          <div
            className={cx(
              "group flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 transition",
              selectedBlockId === blockItem.id ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300",
              blockItem.hidden && "opacity-55"
            )}
            key={blockItem.id}
          >
            <button
              className="min-w-0 flex-1 text-start"
              onClick={() => onSelectBlock(blockItem.id)}
              type="button"
            >
              <span className="block truncate text-sm font-bold text-slate-950">{blockLabel(blockItem)}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span>#{index + 1}</span>
                <span>{blockItem.type.replaceAll("_", " ")}</span>
                {blockItem.locked ? <span>preset</span> : null}
                {blockItem.hidden ? <span>hidden</span> : null}
              </span>
            </button>
            <IconButton
              className="h-8 w-8 rounded-md"
              disabled={!canEdit}
              icon={blockItem.hidden ? "view" : "pause"}
              label={blockItem.hidden ? "Show block" : "Hide block"}
              onClick={() => setBlock({ ...blockItem, hidden: !blockItem.hidden })}
            />
            <IconButton
              className="h-8 w-8 rounded-md"
              disabled={!canEdit}
              icon="lock"
              label={blockItem.locked ? "Unset preset" : "Mark preset"}
              onClick={() => setBlock({ ...blockItem, locked: !blockItem.locked })}
            />
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
            No blocks match this search.
          </div>
        )}
      </div>

      <InspectorSection title="Selected Layer">
        <div className="grid grid-cols-2 gap-1.5">
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="plus" onClick={duplicateSelectedBlock}>Duplicate</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="x" onClick={removeSelectedBlock} variant="danger">Delete</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="export" onClick={() => reorderSelectedBlock("back")}>Back</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="upload" onClick={() => reorderSelectedBlock("front")}>Front</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="export" onClick={() => reorderSelectedBlock("backward")}>Down</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !selectedBlock} icon="upload" onClick={() => reorderSelectedBlock("forward")}>Up</Button>
        </div>
      </InspectorSection>

      <Button className="w-full" disabled={!canEdit || !layout.blocks.length} icon="x" onClick={clearAllBlocks} variant="danger">
        Clear all blocks
      </Button>
    </PanelCard>
  );
}

function PageInspector({
  canEdit,
  editorSettings,
  layout,
  onUpdateEditorSettings,
  onUpdateLayout
}: {
  canEdit: boolean;
  editorSettings: EditorSettings;
  layout: TemplateLayout;
  onUpdateEditorSettings: (settings: Partial<EditorSettings>) => void;
  onUpdateLayout: (updater: (current: TemplateLayout) => TemplateLayout) => void;
}) {
  const marginFields: Array<{ key: "marginTopMm" | "marginRightMm" | "marginBottomMm" | "marginLeftMm"; label: string }> = [
    { key: "marginTopMm", label: "Top" },
    { key: "marginRightMm", label: "Right" },
    { key: "marginBottomMm", label: "Bottom" },
    { key: "marginLeftMm", label: "Left" }
  ];

  function updatePage(next: Partial<TemplateLayout["page"]>) {
    if (!canEdit) {
      return;
    }
    onUpdateLayout((current) => ({ ...current, page: { ...current.page, ...next } }));
  }

  return (
    <PanelCard bodyClassName="space-y-3 p-3" title="Page">
      <InspectorSection title="Page Setup">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-600">
            Size
            <input className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm" disabled value="A4" readOnly />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Direction
            <SelectFilter
              className="mt-1 w-full rounded-md"
              disabled={!canEdit}
              onChange={(event) => updatePage({ direction: event.target.value as "rtl" | "ltr" })}
              value={layout.page.direction}
            >
              <option value="rtl">RTL</option>
              <option value="ltr">LTR</option>
            </SelectFilter>
          </label>
        </div>
        <label className="block text-xs font-bold text-slate-600">
          Background
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2"
            disabled={!canEdit}
            onChange={(event) => updatePage({ backgroundColor: event.target.value })}
            type="color"
            value={layout.page.backgroundColor || "#ffffff"}
          />
        </label>
      </InspectorSection>

      <InspectorSection title="Margins">
        <div className="grid grid-cols-2 gap-2">
          {marginFields.map((field) => (
            <label className="text-xs font-bold text-slate-600" key={field.key}>
              {field.label} mm
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canEdit}
                min={0}
                onChange={(event) => updatePage({ [field.key]: Number(event.target.value) })}
                type="number"
                value={Number(layout.page[field.key] || 0)}
              />
            </label>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="Grid & Snap">
        <div className="space-y-2">
          {([
            ["showGrid", "Show grid"],
            ["snapEnabled", "Snap to grid"],
            ["showRulers", "Show rulers"]
          ] as Array<[keyof Pick<EditorSettings, "showGrid" | "showRulers" | "snapEnabled">, string]>).map(([key, label]) => (
            <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700" key={key}>
              {label}
              <input
                checked={Boolean(editorSettings[key])}
                disabled={!canEdit}
                onChange={(event) => onUpdateEditorSettings({ [key]: event.target.checked })}
                type="checkbox"
              />
            </label>
          ))}
        </div>
        <label className="block text-xs font-bold text-slate-600">
          Grid size mm
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canEdit}
            max={25}
            min={1}
            onChange={(event) => onUpdateEditorSettings({ gridSizeMm: clampNumber(Number(event.target.value), 1, 25) })}
            type="number"
            value={editorSettings.gridSizeMm}
          />
        </label>
      </InspectorSection>
    </PanelCard>
  );
}

function TemplateInspector({
  canEdit,
  clearAllBlocks,
  description,
  detail,
  isLegacy,
  name,
  onArchiveTemplate,
  onOpenSetup,
  onSave,
  redoCount,
  setDescription,
  setName,
  undoCount
}: {
  canEdit: boolean;
  clearAllBlocks: () => void;
  description: string;
  detail: DocumentTemplateDetail | null;
  isLegacy: boolean;
  name: string;
  onArchiveTemplate: () => void;
  onOpenSetup: () => void;
  onSave: () => void;
  redoCount: number;
  setDescription: (value: string) => void;
  setName: (value: string) => void;
  undoCount: number;
}) {
  const status = detail?.template.status || "draft";

  return (
    <PanelCard
      bodyClassName="space-y-3 p-3"
      title="Template"
      actions={<StatusBadge tone={isLegacy ? "amber" : "blue"}>{isLegacy ? "legacy" : status}</StatusBadge>}
    >
      <InspectorSection title="Identity">
        <label className="block text-xs font-bold text-slate-600">
          Template name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Notes
          <textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
      </InspectorSection>

      <InspectorSection title="Workflow">
        <div className="grid grid-cols-2 gap-1.5">
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="save" onClick={onSave} variant="primary">Save</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" icon="settings" onClick={onOpenSetup}>Open setup</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!detail} icon="shield" onClick={onArchiveTemplate} variant="danger">Archive</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="x" onClick={clearAllBlocks} variant="danger">Clear blocks</Button>
        </div>
      </InspectorSection>

      <InspectorSection title="History" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Undo states</p>
            <p className="mt-1 text-xl font-black text-slate-950">{undoCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Redo states</p>
            <p className="mt-1 text-xl font-black text-slate-950">{redoCount}</p>
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500">Use Ctrl/Cmd + Z or Y while focus is on the editor canvas.</p>
      </InspectorSection>
    </PanelCard>
  );
}

function TableBlockEditor({
  blockItem,
  canEdit,
  pageDirection,
  selectedCell,
  setBlock,
  setSelectedCell
}: {
  blockItem: TemplateBlock;
  canEdit: boolean;
  pageDirection: TemplateLayout["page"]["direction"];
  selectedCell: CellCoordinate;
  setBlock: (block: TemplateBlock) => void;
  setSelectedCell: (cell: CellCoordinate) => void;
}) {
  const rows = normalizeTableRows(blockItem);
  const safeSelection = clampTableSelection(rows, selectedCell);
  const rowIndex = safeSelection.row;
  const colIndex = safeSelection.col;
  const activeCell = rows[rowIndex]?.[colIndex] || tableCell();
  const activeStyle = activeCell.style || {};
  const activeFontWeight = String(activeStyle.fontWeight || blockItem.style?.fontWeight || "400");
  const activeBold = ["700", "800", "900", "bold"].includes(activeFontWeight);
  const activeItalic = activeStyle.fontStyle === "italic";
  const activeUnderlined = activeStyle.textDecoration === "underline";
  const canMergeRight = canMergeTableCellRight(rows, safeSelection);
  const canMergeDown = canMergeTableCellDown(rows, safeSelection);
  const columnCount = Math.max(rows[0]?.length || 1, 1);
  const rowCount = Math.max(rows.length, 1);
  const columnWidths = normalizeTableTrackSizes(blockItem.columnWidths, columnCount);
  const rowHeights = normalizeTableTrackSizes(blockItem.rowHeights, rowCount);
  const selectedColumnWidth = columnWidths.slice(colIndex, colIndex + activeCell.colSpan).reduce((sum, width) => sum + width, 0);
  const selectedRowHeight = rowHeights.slice(rowIndex, rowIndex + activeCell.rowSpan).reduce((sum, height) => sum + height, 0);

  function formatTrackPercent(value: number) {
    return `${Math.round(value * 10) / 10}%`;
  }

  function commitResult(result: TableEditResult, nextColumnWidths: unknown = blockItem.columnWidths, nextRowHeights: unknown = blockItem.rowHeights) {
    const nextColumnCount = Math.max(result.rows[0]?.length || 1, 1);
    const nextRowCount = Math.max(result.rows.length, 1);
    setBlock({
      ...blockItem,
      columnWidths: normalizeTableTrackSizes(nextColumnWidths, nextColumnCount),
      rowHeights: normalizeTableTrackSizes(nextRowHeights, nextRowCount),
      rows: serializeTableRows(result.rows)
    });
    setSelectedCell(result.selection);
  }

  function selectCell(cell: CellCoordinate) {
    setSelectedCell(clampTableSelection(rows, cell));
  }

  function updateActiveCell(next: Partial<NormalizedTableCell>) {
    commitResult(updateTableCell(rows, safeSelection, next));
  }

  function updateActiveCellStyle(next: Partial<NonNullable<TemplateBlock["style"]>>) {
    updateActiveCell({ style: { ...activeStyle, ...next } });
  }

  function insertFieldToken(field: string) {
    const separator = activeCell.content && !activeCell.content.endsWith(" ") ? " " : "";
    updateActiveCell({ content: `${activeCell.content}${separator}{{${field}}}` });
  }

  function updateTableStyle(next: Partial<NonNullable<TemplateBlock["style"]>>) {
    setBlock({ ...blockItem, style: { ...blockItem.style, ...next } });
  }

  function setDefaultFontSize(value: number) {
    updateTableStyle({ fontSize: clampNumber(Math.round(value), 6, 36) });
  }

  function setCellFontSize(value: number) {
    updateActiveCellStyle({ fontSize: clampNumber(Math.round(value), 6, 36) });
  }

  const tablePadding = Number(blockItem.style?.cellPaddingMm ?? 1.5);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Cells</span>
          <span className="text-[11px] font-semibold text-slate-400">{rows.length} x {rows[0]?.length || 0}</span>
        </div>
        <div className="space-y-1.5 p-2">
          {rows.map((row, rowNumber) => (
            <div className="grid gap-1.5" key={rowNumber} style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
              {row.map((cell, colNumber) => (
                <button
                  className={cx(
                    "min-h-9 min-w-0 rounded-md border px-2 py-1.5 text-start text-xs font-semibold transition",
                    safeSelection.row === rowNumber && safeSelection.col === colNumber ? "border-[#061d49] bg-blue-50 ring-2 ring-[#061d49]/10" : "border-slate-300 bg-white hover:border-slate-400",
                    cell.hidden && "bg-slate-100 text-slate-400"
                  )}
                  disabled={cell.hidden}
                  key={`${rowNumber}-${colNumber}`}
                  onClick={() => selectCell({ row: rowNumber, col: colNumber })}
                  type="button"
                >
                  <span className="block truncate">{cell.hidden ? "merged" : cell.content || `R${rowNumber + 1} C${colNumber + 1}`}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <InspectorSection defaultOpen title={`Cell R${rowIndex + 1} C${colIndex + 1}`}>
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6"
          dir="auto"
          disabled={!canEdit || activeCell.hidden}
          onChange={(event) => updateActiveCell({ content: event.target.value })}
          placeholder="Cell text or {{document.subject}}"
          value={activeCell.content}
        />
        <div className="flex flex-wrap gap-1.5">
          {commonDynamicFields.map((field) => (
            <button
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              disabled={!canEdit || activeCell.hidden}
              key={field}
              onClick={() => insertFieldToken(field)}
              type="button"
            >
              {dynamicFieldLabel(field)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <WordControlButton active={activeBold} disabled={!canEdit || activeCell.hidden} onClick={() => updateActiveCellStyle({ fontWeight: activeBold ? "400" : "700" })} title="Bold">B</WordControlButton>
          <WordControlButton active={activeItalic} className="italic" disabled={!canEdit || activeCell.hidden} onClick={() => updateActiveCellStyle({ fontStyle: activeItalic ? "normal" : "italic" })} title="Italic">I</WordControlButton>
          <WordControlButton active={activeUnderlined} className="underline" disabled={!canEdit || activeCell.hidden} onClick={() => updateActiveCellStyle({ textDecoration: activeUnderlined ? "none" : "underline" })} title="Underline">U</WordControlButton>
          {textAlignOptions.map((option) => (
            <IconButton
              className={cx(
                "h-8 w-8 rounded-md",
                resolveTextAlign(activeStyle.textAlign || blockItem.style?.textAlign, pageDirection) === option.align && "border-[#061d49] bg-[#061d49] text-white hover:bg-[#061d49]"
              )}
              disabled={!canEdit || activeCell.hidden}
              icon={option.icon}
              key={option.align}
              label={option.label}
              onClick={() => updateActiveCellStyle({ textAlign: option.align })}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-600">
            Font
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit || activeCell.hidden} max={36} min={6} onChange={(event) => setCellFontSize(Number(event.target.value))} type="number" value={Number(activeStyle.fontSize || blockItem.style?.fontSize || 9)} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Text color
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit || activeCell.hidden} onChange={(event) => updateActiveCellStyle({ color: event.target.value })} type="color" value={colorInputValue(activeStyle.color, blockItem.style?.color || "#111827")} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Fill
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit || activeCell.hidden} onChange={(event) => updateActiveCellStyle({ backgroundColor: event.target.value })} type="color" value={colorInputValue(activeStyle.backgroundColor, blockItem.style?.backgroundColor || "#ffffff")} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Span
            <input className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500" readOnly value={`${activeCell.colSpan} col x ${activeCell.rowSpan} row`} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Cell width
            <input className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500" readOnly value={formatTrackPercent(selectedColumnWidth)} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Cell height
            <input className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500" readOnly value={formatTrackPercent(selectedRowHeight)} />
          </label>
        </div>
      </InspectorSection>

      <InspectorSection title="Rows & Columns">
        <div className="grid grid-cols-2 gap-1.5">
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="plus" onClick={() => {
            const result = insertTableRow(rows, safeSelection, 0);
            commitResult(result, columnWidths, insertTableTrackSize(rowHeights, rowCount, result.selection.row));
          }}>Row above</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="plus" onClick={() => {
            const result = insertTableRow(rows, safeSelection, 1);
            commitResult(result, columnWidths, insertTableTrackSize(rowHeights, rowCount, result.selection.row));
          }}>Row below</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="plus" onClick={() => {
            const result = insertTableColumn(rows, safeSelection, 0);
            commitResult(result, insertTableTrackSize(columnWidths, columnCount, result.selection.col), rowHeights);
          }}>Col left</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="plus" onClick={() => {
            const result = insertTableColumn(rows, safeSelection, 1);
            commitResult(result, insertTableTrackSize(columnWidths, columnCount, result.selection.col), rowHeights);
          }}>Col right</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || rows.length <= 1} icon="x" onClick={() => {
            const result = deleteTableRow(rows, safeSelection);
            commitResult(result, columnWidths, deleteTableTrackSize(rowHeights, rowCount, safeSelection.row));
          }} variant="danger">Delete row</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || (rows[0]?.length || 0) <= 1} icon="x" onClick={() => {
            const result = deleteTableColumn(rows, safeSelection);
            commitResult(result, deleteTableTrackSize(columnWidths, columnCount, safeSelection.col), rowHeights);
          }} variant="danger">Delete col</Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !canMergeRight} icon="table" onClick={() => commitResult(mergeTableCellRight(rows, safeSelection))}>Merge right</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || !canMergeDown} icon="table" onClick={() => commitResult(mergeTableCellDown(rows, safeSelection))}>Merge down</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit || activeCell.hidden || (activeCell.colSpan === 1 && activeCell.rowSpan === 1)} icon="reset" onClick={() => commitResult(splitTableCell(rows, safeSelection))}>Split</Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="reset" onClick={() => setBlock({ ...blockItem, columnWidths: equalTableTrackSizes(columnCount) })}>Equal cols</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="reset" onClick={() => setBlock({ ...blockItem, rowHeights: equalTableTrackSizes(rowCount) })}>Equal rows</Button>
          <Button className="min-h-8 px-2 py-1 text-xs" disabled={!canEdit} icon="reset" onClick={() => setBlock({ ...blockItem, columnWidths: equalTableTrackSizes(columnCount), rowHeights: equalTableTrackSizes(rowCount) })}>Reset grid</Button>
        </div>
      </InspectorSection>

      <InspectorSection title="Table Appearance">
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
          <input checked={Boolean(blockItem.headerRow)} disabled={!canEdit} onChange={(event) => setBlock({ ...blockItem, headerRow: event.target.checked })} type="checkbox" />
          Header row
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-600">
            Font
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} max={36} min={6} onChange={(event) => setDefaultFontSize(Number(event.target.value))} type="number" value={blockItem.style?.fontSize || 9} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Padding mm
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} max={8} min={0} onChange={(event) => updateTableStyle({ cellPaddingMm: clampNumber(Number(event.target.value), 0, 8) })} step="0.5" type="number" value={tablePadding} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Border
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} max={8} min={0} onChange={(event) => updateTableStyle({ borderWidth: clampNumber(Number(event.target.value), 0, 8) })} type="number" value={blockItem.style?.borderWidth ?? 1} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Border color
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateTableStyle({ borderColor: event.target.value })} type="color" value={blockItem.style?.borderColor || "#cbd5e1"} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Header fill
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateTableStyle({ headerBackgroundColor: event.target.value })} type="color" value={blockItem.style?.headerBackgroundColor || "#f8fafc"} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Cell fill
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2" disabled={!canEdit} onChange={(event) => updateTableStyle({ backgroundColor: event.target.value })} type="color" value={colorInputValue(blockItem.style?.backgroundColor, "#ffffff")} />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Align
            <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => updateTableStyle({ textAlign: event.target.value as PhysicalTextAlign })} value={resolveTextAlign(blockItem.style?.textAlign, pageDirection)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </SelectFilter>
          </label>
        </div>
      </InspectorSection>
    </div>
  );
}
