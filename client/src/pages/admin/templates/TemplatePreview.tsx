import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { templateApi } from "../../../api";
import type { TemplateBlock, TemplateLayout } from "../../../api";
import { IconButton, PanelCard, SelectFilter } from "../../../components/ui";
import {
  a4Height,
  a4Width,
  dynamicFieldLabels,
  scenarioValues,
  type PreviewScenario
} from "../../../components/admin/templates/builder";
import { cx } from "../../../lib/classNames";
import {
  normalizeTableRows,
  normalizeTableTrackSizes,
  resizeAdjacentTableTracks,
  resizeTableOuterFrame
} from "../templateTableUtils";
import type { CellCoordinate, NormalizedTableCell, TableOuterResizeEdge } from "../templateTableUtils";

type TemplateTextAlign = NonNullable<TemplateBlock["style"]>["textAlign"];
export type PhysicalTextAlign = Extract<TemplateTextAlign, "left" | "center" | "right">;
type ResizeHandle = "nw" | "ne" | "sw" | "se";
type TableGridResizeHandle =
  | { type: "column"; index: number }
  | { type: "outer"; edge: TableOuterResizeEdge }
  | { type: "row"; index: number };

export type EditorSettings = {
  activeInspectorTab: "block" | "layers" | "page" | "template";
  gridSizeMm: number;
  showGrid: boolean;
  showRulers: boolean;
  snapEnabled: boolean;
};

type BlockDragState = {
  blockId: string;
  pageHeightPx: number;
  pageWidthPx: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type BlockResizeState = BlockDragState & {
  handle: ResizeHandle;
  startHeight: number;
  startWidth: number;
};

type TableGridResizeState = {
  blockHeightPx: number;
  blockId: string;
  blockWidthPx: number;
  handle: TableGridResizeHandle;
  pageHeightPx: number;
  pageWidthPx: number;
  pointerId: number;
  startBlock: Pick<TemplateBlock, "height" | "width" | "x" | "y">;
  startClientX: number;
  startClientY: number;
  startColumnWidths: number[];
  startRowHeights: number[];
};

const defaultEditorSettings: EditorSettings = {
  activeInspectorTab: "block",
  gridSizeMm: 5,
  showGrid: false,
  showRulers: false,
  snapEnabled: false
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMm(value: number) {
  return Math.round(value * 10) / 10;
}

export function imagePreviewSource(blockItem: TemplateBlock) {
  if (blockItem.assetId) {
    return templateApi.admin.logoAssetContentUrl(blockItem.assetId);
  }

  return blockItem.src || "";
}


export function blockLabel(block: TemplateBlock) {
  if (block.type === "dynamic_field") {
    return block.field || "dynamic field";
  }

  return block.content?.split("\n")[0]?.slice(0, 32) || block.type.replaceAll("_", " ");
}

export function dynamicFieldLabel(field: string) {
  return dynamicFieldLabels[field] || field.replace("document.", "");
}

function displayBlockContent(block: TemplateBlock, scenario: PreviewScenario) {
  if (block.type === "dynamic_field") {
    return scenarioValues[scenario][block.field || ""] || block.field || "Dynamic field";
  }

  if (block.type === "signature_zone") {
    const count = scenario === "threeSignatures" ? 3 : Number(block.limit || 5);
    return Array.from({ length: Math.max(1, Math.min(count, 5)) }, (_, index) => `تایید / امضا ${index + 1}`).join("\n");
  }

  if (block.type === "comments_zone") {
    return "Workflow comments";
  }

  if (block.type === "qr") {
    return "QR";
  }

  if (block.type === "page_number") {
    return "1";
  }

  if (block.type === "box" || block.type === "line") {
    return "";
  }

  if (block.type === "cc_list" && scenario !== "withCc") {
    return "کاپی ها";
  }

  return block.content || block.type.replaceAll("_", " ");
}

function resolvePreviewFieldTokens(content: string, scenario: PreviewScenario) {
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_token, field: string) => scenarioValues[scenario][field] ?? "");
}

export function resolveTextAlign(textAlign: TemplateTextAlign | undefined, pageDirection: TemplateLayout["page"]["direction"]): PhysicalTextAlign {
  if (textAlign === "center" || textAlign === "left" || textAlign === "right") {
    return textAlign;
  }
  if (textAlign === "end") {
    return pageDirection === "rtl" ? "left" : "right";
  }
  return pageDirection === "rtl" ? "right" : "left";
}

function styleForBlock(block: TemplateBlock, pageDirection: TemplateLayout["page"]["direction"]): CSSProperties {
  const style = block.style || {};
  const borderWidth = Number(style.borderWidth || 0);
  const commonStyle: CSSProperties = {
    left: `${(block.x / a4Width) * 100}%`,
    top: `${(block.y / a4Height) * 100}%`,
    width: `${(block.width / a4Width) * 100}%`,
    color: style.color || "#111827",
    backgroundColor: style.backgroundColor || "transparent",
    borderColor: style.borderColor || "#94a3b8",
    borderStyle: style.borderStyle || "solid",
    borderWidth: `${borderWidth}px`,
    fontFamily: style.fontFamily || undefined,
    fontSize: `${style.fontSize || 10}px`,
    lineHeight: style.lineHeight || 1.65,
    fontWeight: style.fontWeight || 400,
    fontStyle: style.fontStyle || "normal",
    letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : block.type === "dynamic_field" && block.field?.startsWith("document.date") ? "0.04em" : undefined,
    textDecoration: style.textDecoration || "none",
    textAlign: resolveTextAlign(style.textAlign, pageDirection)
  };

  if (block.type === "line") {
    return {
      ...commonStyle,
      backgroundColor: "transparent",
      borderWidth: 0,
      borderTop: `${Math.max(1, borderWidth)}px ${style.borderStyle || "solid"} ${style.borderColor || "#0f172a"}`,
      height: `${(Math.max(0.5, block.height) / a4Height) * 100}%`,
      minHeight: 0
    };
  }

  if (block.type === "table") {
    return {
      ...commonStyle,
      height: `${(block.height / a4Height) * 100}%`,
      minHeight: `${(block.height / a4Height) * 100}%`
    };
  }

  if (block.type === "image" || block.type === "logo") {
    return {
      ...commonStyle,
      height: `${(block.height / a4Height) * 100}%`
    };
  }

  return {
    ...commonStyle,
    minHeight: `${(block.height / a4Height) * 100}%`
  };
}

function estimatedPreviewLineCount(content: string, widthMm: number, fontSize: number) {
  if (!content.trim()) {
    return 1;
  }

  const usableWidth = Math.max(4, widthMm - 3);
  const averageGlyphsPerLine = Math.max(8, Math.floor((usableWidth / Math.max(1, fontSize * 0.352778)) * 1.75));
  return content.split(/\r\n|\r|\n/).reduce((total, line) => {
    const length = Array.from(line || " ").length;
    return total + Math.max(1, Math.ceil(length / averageGlyphsPerLine));
  }, 0);
}

function measuredPreviewTextBlock(block: TemplateBlock, content: string) {
  const style = block.style || {};
  const baseFontSize = Number(style.fontSize || 10);
  const minFontSize = Math.max(6, Math.min(baseFontSize, Number(block.minFontSize || 8)));
  const maxLines = Math.max(0, Math.min(24, Math.round(Number(block.maxLines || 0))));
  const lineHeight = Number(style.lineHeight || 1.65);

  if (!maxLines) {
    return { fontSize: baseFontSize, height: block.height };
  }

  let fontSize = baseFontSize;
  let lines = estimatedPreviewLineCount(content, block.width, fontSize);
  while (lines > maxLines && fontSize > minFontSize) {
    fontSize -= 1;
    lines = estimatedPreviewLineCount(content, block.width, fontSize);
  }

  const contentHeight = (Math.min(lines, maxLines) * fontSize * 0.352778 * lineHeight) + 3;
  return {
    fontSize,
    height: Math.max(block.height, Number(contentHeight.toFixed(2)))
  };
}

function textContentForPreview(block: TemplateBlock, scenario: PreviewScenario) {
  return ["dynamic_field", "rich_text", "text", "watermark", "cc_list", "page_number"].includes(block.type)
    ? displayBlockContent(block, scenario)
    : null;
}

function canEditTextDirectly(block: TemplateBlock) {
  return ["cc_list", "rich_text", "text", "watermark"].includes(block.type);
}

function previewLayoutBlocks(layout: TemplateLayout, scenario: PreviewScenario) {
  const measured = layout.blocks.map((block, index) => {
    const content = textContentForPreview(block, scenario);
    const measurement = content === null ? { fontSize: Number(block.style?.fontSize || 10), height: block.height } : measuredPreviewTextBlock(block, content);
    return {
      block,
      index,
      measurement,
      originalHeight: block.height,
      y: block.y
    };
  });
  const byId = new Map<string, TemplateBlock>();
  let yOffset = 0;

  [...measured]
    .sort((left, right) => left.y - right.y || left.index - right.index)
    .forEach((item) => {
      byId.set(item.block.id, {
        ...item.block,
        height: item.measurement.height,
        y: roundMm(item.block.y + yOffset),
        style: {
          ...item.block.style,
          fontSize: item.measurement.fontSize
        }
      });
      if (item.block.reflowBelow) {
        yOffset += Math.max(0, item.measurement.height - item.originalHeight);
      }
    });

  return byId;
}


function tableCellPreviewStyle(blockItem: TemplateBlock, cell: NormalizedTableCell, rowIndex: number, pageDirection: TemplateLayout["page"]["direction"]): CSSProperties {
  const tableStyle = blockItem.style || {};
  const cellStyle = cell.style || {};
  const isHeader = Boolean(blockItem.headerRow) && rowIndex === 0;
  const borderWidth = `${Math.max(0, Number(tableStyle.borderWidth ?? 1))}px`;
  const borderColor = tableStyle.borderColor || "#cbd5e1";

  return {
    backgroundColor: cellStyle.backgroundColor || (isHeader ? tableStyle.headerBackgroundColor || "#f8fafc" : tableStyle.backgroundColor || "#ffffff"),
    border: `${borderWidth} solid ${borderColor}`,
    color: cellStyle.color || tableStyle.color || "#111827",
    fontFamily: cellStyle.fontFamily || tableStyle.fontFamily || undefined,
    fontSize: `${Number(cellStyle.fontSize || tableStyle.fontSize || 9)}px`,
    fontStyle: cellStyle.fontStyle || tableStyle.fontStyle || "normal",
    fontWeight: cellStyle.fontWeight || (isHeader ? "700" : tableStyle.fontWeight || "400"),
    padding: `${Number(tableStyle.cellPaddingMm ?? 1.5)}mm`,
    textAlign: resolveTextAlign(cellStyle.textAlign || tableStyle.textAlign, pageDirection),
    textDecoration: cellStyle.textDecoration || tableStyle.textDecoration || "none",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };
}

function TablePreview({
  blockItem,
  canEdit,
  onMoveResize,
  onSelectCell,
  onStartResize,
  onStopResize,
  pageDirection,
  scenario,
  selectedCell,
  selectedTable
}: {
  blockItem: TemplateBlock;
  canEdit?: boolean;
  onMoveResize?: (event: PointerEvent<HTMLElement>) => void;
  onSelectCell?: (cell: CellCoordinate) => void;
  onStartResize?: (event: PointerEvent<HTMLElement>, handle: TableGridResizeHandle) => void;
  onStopResize?: (event: PointerEvent<HTMLElement>) => void;
  pageDirection: TemplateLayout["page"]["direction"];
  scenario: PreviewScenario;
  selectedCell?: CellCoordinate;
  selectedTable?: boolean;
}) {
  const rows = normalizeTableRows(blockItem);
  const headerRow = Boolean(blockItem.headerRow);
  const columnWidths = normalizeTableTrackSizes(blockItem.columnWidths, rows[0]?.length || 1);
  const rowHeights = normalizeTableTrackSizes(blockItem.rowHeights, rows.length);
  const columnStops = columnWidths.slice(0, -1).reduce<number[]>((stops, width) => {
    const previous = stops[stops.length - 1] || 0;
    stops.push(previous + width);
    return stops;
  }, []);
  const rowStops = rowHeights.slice(0, -1).reduce<number[]>((stops, height) => {
    const previous = stops[stops.length - 1] || 0;
    stops.push(previous + height);
    return stops;
  }, []);
  const showResizeHandles = Boolean(canEdit && selectedTable);

  function startResize(event: PointerEvent<HTMLElement>, handle: TableGridResizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    onStartResize?.(event, handle);
  }

  return (
    <div className="relative h-full w-full" dir={pageDirection}>
      <table className="h-full w-full table-fixed border-collapse bg-white text-inherit">
        <colgroup>
          {columnWidths.map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ height: `${rowHeights[rowIndex] || 0}%` }}>
              {row.map((cell, colIndex) => {
                if (cell.hidden) {
                  return null;
                }

                const CellTag = headerRow && rowIndex === 0 ? "th" : "td";
                const active = selectedTable && selectedCell?.row === rowIndex && selectedCell.col === colIndex;
                return (
                  <CellTag
                    className={cx(
                      "relative align-top transition",
                      canEdit && "cursor-text hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,.55)]",
                      active && "shadow-[inset_0_0_0_2px_#061d49]"
                    )}
                    colSpan={cell.colSpan}
                    key={colIndex}
                    onClick={(event) => {
                      if (!canEdit) {
                        return;
                      }
                      event.stopPropagation();
                      onSelectCell?.({ row: rowIndex, col: colIndex });
                    }}
                    onPointerDown={(event) => {
                      if (canEdit) {
                        event.stopPropagation();
                      }
                    }}
                    role={canEdit ? "button" : undefined}
                    rowSpan={cell.rowSpan}
                    style={tableCellPreviewStyle(blockItem, cell, rowIndex, pageDirection)}
                    tabIndex={canEdit ? 0 : undefined}
                  >
                    {resolvePreviewFieldTokens(cell.content, scenario)}
                  </CellTag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {showResizeHandles ? (
        <>
          {columnStops.map((position, index) => (
            <span
              aria-hidden="true"
              className={cx(
                "absolute top-0 z-30 h-full w-2 cursor-col-resize bg-blue-500/10 transition hover:bg-blue-500/30",
                pageDirection === "rtl" ? "translate-x-1/2" : "-translate-x-1/2"
              )}
              key={`col-${index}`}
              onPointerCancel={onStopResize}
              onPointerDown={(event) => startResize(event, { type: "column", index })}
              onPointerMove={onMoveResize}
              onPointerUp={onStopResize}
              style={{ insetInlineStart: `${position}%` }}
            />
          ))}
          {rowStops.map((position, index) => (
            <span
              aria-hidden="true"
              className="absolute left-0 z-30 h-2 w-full -translate-y-1/2 cursor-row-resize bg-blue-500/10 transition hover:bg-blue-500/30"
              key={`row-${index}`}
              onPointerCancel={onStopResize}
              onPointerDown={(event) => startResize(event, { type: "row", index })}
              onPointerMove={onMoveResize}
              onPointerUp={onStopResize}
              style={{ top: `${position}%` }}
            />
          ))}
          {(["left", "right"] as TableOuterResizeEdge[]).map((edge) => (
            <span
              aria-hidden="true"
              className={cx(
                "absolute inset-y-0 z-40 w-2 cursor-ew-resize bg-[#061d49]/10 transition hover:bg-[#061d49]/25",
                edge === "left" ? "-left-1" : "-right-1"
              )}
              key={edge}
              onPointerCancel={onStopResize}
              onPointerDown={(event) => startResize(event, { type: "outer", edge })}
              onPointerMove={onMoveResize}
              onPointerUp={onStopResize}
            />
          ))}
          {(["top", "bottom"] as TableOuterResizeEdge[]).map((edge) => (
            <span
              aria-hidden="true"
              className={cx(
                "absolute left-0 z-40 h-2 w-full cursor-ns-resize bg-[#061d49]/10 transition hover:bg-[#061d49]/25",
                edge === "top" ? "-top-1" : "-bottom-1"
              )}
              key={edge}
              onPointerCancel={onStopResize}
              onPointerDown={(event) => startResize(event, { type: "outer", edge })}
              onPointerMove={onMoveResize}
              onPointerUp={onStopResize}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function TemplateA4Preview({
  canEdit = false,
  editorSettings = defaultEditorSettings,
  layout,
  onBeforeBlockChange,
  onChangeBlock,
  onSelectBlock,
  onSelectTableCell,
  scenario,
  selectedCell,
  selectedBlockId,
  zoom
}: {
  canEdit?: boolean;
  editorSettings?: EditorSettings;
  layout: TemplateLayout;
  onBeforeBlockChange?: () => void;
  onChangeBlock?: (block: TemplateBlock) => void;
  onSelectBlock?: (blockId: string) => void;
  onSelectTableCell?: (cell: CellCoordinate) => void;
  scenario: PreviewScenario;
  selectedCell?: CellCoordinate;
  selectedBlockId?: string | null;
  zoom: number;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<BlockDragState | null>(null);
  const [resizeState, setResizeState] = useState<BlockResizeState | null>(null);
  const [tableResizeState, setTableResizeState] = useState<TableGridResizeState | null>(null);
  const previewBlocks = useMemo(() => previewLayoutBlocks(layout, scenario), [layout, scenario]);

  useEffect(() => {
    if (!dragState && !resizeState && !tableResizeState) {
      return undefined;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    if (tableResizeState) {
      const handle = tableResizeState.handle;
      document.body.style.cursor = handle.type === "column" || (handle.type === "outer" && ["left", "right"].includes(handle.edge)) ? "col-resize" : "row-resize";
    } else {
      document.body.style.cursor = resizeState ? "nwse-resize" : "move";
    }
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragState, resizeState, tableResizeState]);

  function snapValue(value: number) {
    if (!editorSettings.snapEnabled || !editorSettings.gridSizeMm) {
      return roundMm(value);
    }
    return roundMm(Math.round(value / editorSettings.gridSizeMm) * editorSettings.gridSizeMm);
  }

  function startBlockDrag(event: PointerEvent<HTMLElement>, blockItem: TemplateBlock) {
    onSelectBlock?.(blockItem.id);
    if (!canEdit || !onChangeBlock || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    onBeforeBlockChange?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      blockId: blockItem.id,
      pageHeightPx: rect.height,
      pageWidthPx: rect.width,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: blockItem.x,
      startY: blockItem.y
    });
  }

  function moveBlockDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState || !onChangeBlock) {
      return;
    }

    const blockItem = layout.blocks.find((item) => item.id === dragState.blockId);
    if (!blockItem) {
      return;
    }

    const deltaX = ((event.clientX - dragState.startClientX) / dragState.pageWidthPx) * a4Width;
    const deltaY = ((event.clientY - dragState.startClientY) / dragState.pageHeightPx) * a4Height;
    const maxX = Math.max(0, a4Width - blockItem.width);
    const maxY = Math.max(0, a4Height - blockItem.height);
    onChangeBlock({
      ...blockItem,
      x: snapValue(clampNumber(dragState.startX + deltaX, 0, maxX)),
      y: snapValue(clampNumber(dragState.startY + deltaY, 0, maxY))
    });
  }

  function stopBlockDrag(event: PointerEvent<HTMLElement>) {
    if (dragState && event.currentTarget.hasPointerCapture(dragState.pointerId)) {
      event.currentTarget.releasePointerCapture(dragState.pointerId);
    }
    setDragState(null);
  }

  function startBlockResize(event: PointerEvent<HTMLElement>, blockItem: TemplateBlock, handle: ResizeHandle) {
    onSelectBlock?.(blockItem.id);
    if (!canEdit || !onChangeBlock || event.button !== 0) {
      return;
    }

    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBeforeBlockChange?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeState({
      blockId: blockItem.id,
      handle,
      pageHeightPx: rect.height,
      pageWidthPx: rect.width,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHeight: blockItem.height,
      startWidth: blockItem.width,
      startX: blockItem.x,
      startY: blockItem.y
    });
  }

  function moveBlockResize(event: PointerEvent<HTMLElement>) {
    if (!resizeState || !onChangeBlock) {
      return;
    }

    const blockItem = layout.blocks.find((item) => item.id === resizeState.blockId);
    if (!blockItem) {
      return;
    }

    const deltaX = ((event.clientX - resizeState.startClientX) / resizeState.pageWidthPx) * a4Width;
    const deltaY = ((event.clientY - resizeState.startClientY) / resizeState.pageHeightPx) * a4Height;
    const minSize = 3;
    let nextX = resizeState.startX;
    let nextY = resizeState.startY;
    let nextWidth = resizeState.startWidth;
    let nextHeight = resizeState.startHeight;

    if (resizeState.handle.includes("e")) {
      nextWidth = clampNumber(resizeState.startWidth + deltaX, minSize, a4Width - resizeState.startX);
    }
    if (resizeState.handle.includes("s")) {
      nextHeight = clampNumber(resizeState.startHeight + deltaY, minSize, a4Height - resizeState.startY);
    }
    if (resizeState.handle.includes("w")) {
      const right = resizeState.startX + resizeState.startWidth;
      nextX = clampNumber(resizeState.startX + deltaX, 0, right - minSize);
      nextWidth = right - nextX;
    }
    if (resizeState.handle.includes("n")) {
      const bottom = resizeState.startY + resizeState.startHeight;
      nextY = clampNumber(resizeState.startY + deltaY, 0, bottom - minSize);
      nextHeight = bottom - nextY;
    }

    onChangeBlock({
      ...blockItem,
      height: snapValue(clampNumber(nextHeight, minSize, a4Height - nextY)),
      width: snapValue(clampNumber(nextWidth, minSize, a4Width - nextX)),
      x: snapValue(nextX),
      y: snapValue(nextY)
    });
  }

  function stopBlockResize(event: PointerEvent<HTMLElement>) {
    if (resizeState && event.currentTarget.hasPointerCapture(resizeState.pointerId)) {
      event.currentTarget.releasePointerCapture(resizeState.pointerId);
    }
    setResizeState(null);
  }

  function startTableGridResize(event: PointerEvent<HTMLElement>, blockItem: TemplateBlock, handle: TableGridResizeHandle) {
    onSelectBlock?.(blockItem.id);
    if (!canEdit || !onChangeBlock || event.button !== 0) {
      return;
    }

    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const rows = normalizeTableRows(blockItem);
    const blockWidthPx = Math.max(1, (blockItem.width / a4Width) * rect.width);
    const blockHeightPx = Math.max(1, (blockItem.height / a4Height) * rect.height);

    event.preventDefault();
    event.stopPropagation();
    onBeforeBlockChange?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTableResizeState({
      blockHeightPx,
      blockId: blockItem.id,
      blockWidthPx,
      handle,
      pageHeightPx: rect.height,
      pageWidthPx: rect.width,
      pointerId: event.pointerId,
      startBlock: {
        height: blockItem.height,
        width: blockItem.width,
        x: blockItem.x,
        y: blockItem.y
      },
      startClientX: event.clientX,
      startClientY: event.clientY,
      startColumnWidths: normalizeTableTrackSizes(blockItem.columnWidths, rows[0]?.length || 1),
      startRowHeights: normalizeTableTrackSizes(blockItem.rowHeights, rows.length)
    });
  }

  function moveTableGridResize(event: PointerEvent<HTMLElement>) {
    if (!tableResizeState || !onChangeBlock) {
      return;
    }

    const blockItem = layout.blocks.find((item) => item.id === tableResizeState.blockId);
    if (!blockItem) {
      return;
    }

    const handle = tableResizeState.handle;
    if (handle.type === "column") {
      const physicalDeltaPercent = ((event.clientX - tableResizeState.startClientX) / tableResizeState.blockWidthPx) * 100;
      const logicalDeltaPercent = layout.page.direction === "rtl" ? -physicalDeltaPercent : physicalDeltaPercent;
      onChangeBlock({
        ...blockItem,
        columnWidths: resizeAdjacentTableTracks(tableResizeState.startColumnWidths, tableResizeState.startColumnWidths.length, handle.index, logicalDeltaPercent)
      });
      return;
    }

    if (handle.type === "row") {
      const deltaPercent = ((event.clientY - tableResizeState.startClientY) / tableResizeState.blockHeightPx) * 100;
      onChangeBlock({
        ...blockItem,
        rowHeights: resizeAdjacentTableTracks(tableResizeState.startRowHeights, tableResizeState.startRowHeights.length, handle.index, deltaPercent)
      });
      return;
    }

    const deltaMm = handle.edge === "left" || handle.edge === "right"
      ? ((event.clientX - tableResizeState.startClientX) / tableResizeState.pageWidthPx) * a4Width
      : ((event.clientY - tableResizeState.startClientY) / tableResizeState.pageHeightPx) * a4Height;
    const nextFrame = resizeTableOuterFrame(tableResizeState.startBlock, handle.edge, deltaMm, a4Width, a4Height);
    onChangeBlock({
      ...blockItem,
      height: snapValue(nextFrame.height),
      width: snapValue(nextFrame.width),
      x: snapValue(nextFrame.x),
      y: snapValue(nextFrame.y)
    });
  }

  function stopTableGridResize(event: PointerEvent<HTMLElement>) {
    if (tableResizeState && event.currentTarget.hasPointerCapture(tableResizeState.pointerId)) {
      event.currentTarget.releasePointerCapture(tableResizeState.pointerId);
    }
    setTableResizeState(null);
  }

  const gridSizePercentX = (editorSettings.gridSizeMm / a4Width) * 100;
  const gridSizePercentY = (editorSettings.gridSizeMm / a4Height) * 100;
  const pageBackground: CSSProperties = {
    aspectRatio: "210 / 297",
    backgroundColor: layout.page.backgroundColor || "#fff",
    width: `min(100%, ${50 * zoom}rem)`
  };
  if (editorSettings.showGrid) {
    pageBackground.backgroundImage = "linear-gradient(rgba(6,29,73,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,29,73,.1) 1px, transparent 1px)";
    pageBackground.backgroundSize = `${gridSizePercentX}% ${gridSizePercentY}%`;
  }

  return (
    <div className="min-h-0 overflow-auto rounded-md bg-[radial-gradient(circle_at_top,#f8fafc_0,#eef2f7_42%,#e5e7eb_100%)] p-4">
      <div className="flex min-h-full justify-center">
        <div
          className="relative bg-white shadow-[0_18px_50px_rgba(15,23,42,0.14)] ring-1 ring-slate-300/80"
          dir={layout.page.direction}
          ref={pageRef}
          style={pageBackground}
        >
          {editorSettings.showRulers ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-4 border-b border-slate-300 bg-slate-100/80 text-[8px] font-bold text-slate-500">
                <span className="absolute start-2 top-0.5">0</span>
                <span className="absolute start-1/2 top-0.5">105</span>
                <span className="absolute end-2 top-0.5">210</span>
              </div>
              <div className="pointer-events-none absolute bottom-0 start-0 top-0 z-30 w-4 border-e border-slate-300 bg-slate-100/80 text-[8px] font-bold text-slate-500">
                <span className="absolute start-0.5 top-5">0</span>
                <span className="absolute start-0.5 top-1/2">148</span>
              </div>
            </>
          ) : null}

          {layout.blocks.filter((blockItem) => !blockItem.hidden).map((blockItem) => {
            const visualBlock = previewBlocks.get(blockItem.id) || blockItem;
            const directTextEdit = canEdit
              && selectedBlockId === blockItem.id
              && Boolean(onChangeBlock)
              && canEditTextDirectly(blockItem);
            return (
            <div
              aria-label={blockLabel(blockItem)}
              className={cx(
                "absolute whitespace-pre-wrap p-1.5 text-start leading-relaxed outline-none transition",
                selectedBlockId === blockItem.id ? "overflow-visible ring-2 ring-[#2563eb]" : "overflow-hidden",
                selectedBlockId !== blockItem.id && onSelectBlock && "hover:ring-1 hover:ring-[#2563eb]/50",
                canEdit && onChangeBlock ? "cursor-move touch-none active:cursor-grabbing" : "cursor-default",
                (dragState?.blockId === blockItem.id || resizeState?.blockId === blockItem.id || tableResizeState?.blockId === blockItem.id) && "z-20 shadow-lg ring-2 ring-[#061d49]",
                blockItem.locked && "bg-slate-50/20",
                blockItem.type === "line" && "p-0 leading-none",
                blockItem.type === "table" && "p-0 leading-none",
                blockItem.type === "qr" && "flex items-center justify-center border border-dashed border-slate-400 text-center text-[10px]",
                blockItem.type === "image" || blockItem.type === "logo" ? "flex items-center justify-center p-0" : ""
              )}
              key={blockItem.id}
              onClick={() => {
                onSelectBlock?.(blockItem.id);
                if (blockItem.type !== "table") {
                  return;
                }
                onSelectTableCell?.(selectedCell || { row: 0, col: 0 });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectBlock?.(blockItem.id);
                }
              }}
              onPointerCancel={stopBlockDrag}
              onPointerDown={(event) => startBlockDrag(event, blockItem)}
              onPointerMove={moveBlockDrag}
              onPointerUp={stopBlockDrag}
              role="button"
              style={styleForBlock(visualBlock.type === "table" ? { ...visualBlock, style: { ...visualBlock.style, borderWidth: 0 } } : visualBlock, layout.page.direction)}
              tabIndex={0}
            >
              {imagePreviewSource(blockItem) && ["image", "logo"].includes(blockItem.type) ? (
                <img alt="" className="h-full w-full object-contain" src={imagePreviewSource(blockItem)} />
              ) : ["image", "logo"].includes(blockItem.type) ? (
                <span className="flex h-full w-full items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-500">
                  Choose logo
                </span>
              ) : blockItem.type === "line" ? null : blockItem.type === "table" ? (
                <TablePreview
                  blockItem={blockItem}
                  canEdit={canEdit}
                  onMoveResize={moveTableGridResize}
                  onSelectCell={(cell) => {
                    onSelectBlock?.(blockItem.id);
                    onSelectTableCell?.(cell);
                  }}
                  onStartResize={(event, handle) => startTableGridResize(event, blockItem, handle)}
                  onStopResize={stopTableGridResize}
                  pageDirection={layout.page.direction}
                  scenario={scenario}
                  selectedCell={selectedCell}
                  selectedTable={selectedBlockId === blockItem.id}
                />
              ) : directTextEdit ? (
                <textarea
                  className="h-full min-h-full w-full resize-none border-0 bg-transparent p-0 text-inherit outline-none"
                  dir="auto"
                  onChange={(event) => onChangeBlock?.({ ...blockItem, content: event.target.value })}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  value={blockItem.content || ""}
                />
              ) : (
                displayBlockContent(blockItem, scenario)
              )}
              {selectedBlockId === blockItem.id && canEdit && onChangeBlock ? (["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
                <span
                  className={cx(
                    "absolute z-30 h-2.5 w-2.5 rounded-full border border-[#2563eb] bg-white shadow-sm shadow-blue-900/20",
                    handle === "nw" && "-start-1.5 -top-1.5 cursor-nw-resize",
                    handle === "ne" && "-end-1.5 -top-1.5 cursor-ne-resize",
                    handle === "sw" && "-bottom-1.5 -start-1.5 cursor-sw-resize",
                    handle === "se" && "-bottom-1.5 -end-1.5 cursor-se-resize"
                  )}
                  key={handle}
                  onPointerCancel={stopBlockResize}
                  onPointerDown={(event) => startBlockResize(event, blockItem, handle)}
                  onPointerMove={moveBlockResize}
                  onPointerUp={stopBlockResize}
                />
              )) : null}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PreviewPanel({
  layout,
  onSelectBlock,
  scenario,
  selectedBlockId,
  setScenario,
  setZoom,
  title,
  zoom
}: {
  layout: TemplateLayout;
  onSelectBlock?: (blockId: string) => void;
  scenario: PreviewScenario;
  selectedBlockId?: string | null;
  setScenario: (scenario: PreviewScenario) => void;
  setZoom: (zoom: number) => void;
  title: string;
  zoom: number;
}) {
  return (
    <PanelCard
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 p-3"
      className="flex min-h-[34rem] flex-col xl:sticky xl:top-4 xl:h-[calc(100vh-10rem)]"
      headerClassName="flex-wrap"
      title={title}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <SelectFilter className="h-9 w-36 rounded-md text-xs" onChange={(event) => setScenario(event.target.value as PreviewScenario)} value={scenario}>
            <option value="standard">Standard</option>
            <option value="longBody">Long body</option>
            <option value="threeSignatures">3 signatures</option>
            <option value="withCc">With CC</option>
          </SelectFilter>
          <IconButton className="h-9 w-9 rounded-md" icon="zoomOut" label="Zoom out" onClick={() => setZoom(Math.max(0.7, Number((zoom - 0.1).toFixed(1))))} />
          <span className="w-12 text-center text-xs font-bold text-slate-600">{Math.round(zoom * 100)}%</span>
          <IconButton className="h-9 w-9 rounded-md" icon="zoomIn" label="Zoom in" onClick={() => setZoom(Math.min(1.2, Number((zoom + 0.1).toFixed(1))))} />
        </div>
      )}
    >
      <TemplateA4Preview
        layout={layout}
        onSelectBlock={onSelectBlock}
        scenario={scenario}
        selectedBlockId={selectedBlockId}
        zoom={zoom}
      />
    </PanelCard>
  );
}
