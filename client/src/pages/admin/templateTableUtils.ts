import type { TemplateBlock, TemplateBlockStyle, TemplateTableCell } from "../../api";

export type NormalizedTableCell = {
  colSpan: number;
  content: string;
  hidden: boolean;
  rowSpan: number;
  style?: TemplateBlockStyle;
};

export type CellCoordinate = {
  col: number;
  row: number;
};

export type TableEditResult = {
  rows: NormalizedTableCell[][];
  selection: CellCoordinate;
};

export type TableOuterResizeEdge = "bottom" | "left" | "right" | "top";

export type TableFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type TableDirection = "ltr" | "rtl";

const maxTableColumns = 12;
const maxTableRows = 24;
const minTrackPercent = 4;
const minTableFrameMm = 6;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cloneStyle(style: TemplateBlockStyle | undefined) {
  return style ? { ...style } : undefined;
}

function hasStyle(style: TemplateBlockStyle | undefined) {
  return Boolean(style && Object.keys(style).length);
}

export function tableCell(content = "", style?: TemplateBlockStyle): NormalizedTableCell {
  return { colSpan: 1, content, hidden: false, rowSpan: 1, style: cloneStyle(style) };
}

function normalizeTableCell(cell: TemplateTableCell | undefined): NormalizedTableCell {
  if (typeof cell === "string") {
    return tableCell(String(cell));
  }

  if (cell && typeof cell === "object") {
    return {
      colSpan: clampNumber(Math.round(Number(cell.colSpan) || 1), 1, maxTableColumns),
      content: cell.content || "",
      hidden: Boolean(cell.hidden),
      rowSpan: clampNumber(Math.round(Number(cell.rowSpan) || 1), 1, maxTableRows),
      style: cloneStyle(cell.style)
    };
  }

  return tableCell();
}

export function cloneTableRows(rows: NormalizedTableCell[][]) {
  return rows.map((row) => row.map((cell) => ({ ...cell, style: cloneStyle(cell.style) })));
}

function rawRowsFrom(value: Pick<TemplateBlock, "rows"> | TemplateTableCell[][] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }
  return Array.isArray(value?.rows) && value.rows.length ? value.rows : undefined;
}

export function normalizeTableRows(value: Pick<TemplateBlock, "rows"> | TemplateTableCell[][] | undefined): NormalizedTableCell[][] {
  const sourceRows = rawRowsFrom(value) || [
    ["Header 1", "Header 2", "Header 3"],
    ["", "", ""],
    ["", "", ""]
  ];
  const rowCount = clampNumber(sourceRows.length || 1, 1, maxTableRows);
  const source = sourceRows.slice(0, rowCount);
  const columnCount = clampNumber(
    Math.max(1, ...source.map((row) => Array.isArray(row) ? row.length : 0)),
    1,
    maxTableColumns
  );

  const rows = source.map((row) => {
    const normalized = (Array.isArray(row) ? row : []).slice(0, columnCount).map((cell) => normalizeTableCell(cell));
    while (normalized.length < columnCount) {
      normalized.push(tableCell());
    }
    return normalized;
  });

  const covered = rows.map((row) => row.map(() => false));
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (covered[rowIndex][colIndex]) {
        cell.hidden = true;
        cell.colSpan = 1;
        cell.rowSpan = 1;
        return;
      }

      cell.hidden = false;
      cell.colSpan = clampNumber(cell.colSpan, 1, columnCount - colIndex);
      cell.rowSpan = clampNumber(cell.rowSpan, 1, rows.length - rowIndex);

      for (let nextRow = rowIndex; nextRow < rowIndex + cell.rowSpan; nextRow += 1) {
        for (let nextCol = colIndex; nextCol < colIndex + cell.colSpan; nextCol += 1) {
          if (nextRow === rowIndex && nextCol === colIndex) {
            continue;
          }
          covered[nextRow][nextCol] = true;
        }
      }
    });
  });

  return rows;
}

export function serializeTableRows(rows: NormalizedTableCell[][]): TemplateTableCell[][] {
  return normalizeTableRows(rows).map((row) => row.map((cell) => {
    const serialized: Exclude<TemplateTableCell, string> = {
      colSpan: cell.colSpan,
      content: cell.content,
      hidden: cell.hidden,
      rowSpan: cell.rowSpan
    };
    if (hasStyle(cell.style)) {
      serialized.style = cloneStyle(cell.style);
    }
    return serialized;
  }));
}

export function clampTableSelection(rows: NormalizedTableCell[][], selection: CellCoordinate): CellCoordinate {
  const row = clampNumber(selection.row, 0, Math.max(0, rows.length - 1));
  const col = clampNumber(selection.col, 0, Math.max(0, (rows[row]?.length || 1) - 1));
  return { row, col };
}

export function equalTableTrackSizes(count: number) {
  const safeCount = clampNumber(Math.round(count) || 1, 1, 24);
  return Array.from({ length: safeCount }, () => 100 / safeCount);
}

function rebalanceTrackSizes(values: number[]) {
  if (!values.length) {
    return [100];
  }

  if (values.length * minTrackPercent >= 100) {
    return equalTableTrackSizes(values.length);
  }

  let next = values.map((value) => Math.max(minTrackPercent, value));
  let total = next.reduce((sum, value) => sum + value, 0);

  if (total > 100) {
    let extra = total - 100;
    while (extra > 0.0001) {
      const flexible = next
        .map((value, index) => ({ index, room: value - minTrackPercent }))
        .filter((item) => item.room > 0.0001);
      const flexibleTotal = flexible.reduce((sum, item) => sum + item.room, 0);
      if (!flexible.length || flexibleTotal <= 0) {
        return equalTableTrackSizes(values.length);
      }
      flexible.forEach((item) => {
        const reduction = Math.min(item.room, extra * (item.room / flexibleTotal));
        next[item.index] -= reduction;
      });
      total = next.reduce((sum, value) => sum + value, 0);
      extra = total - 100;
    }
  } else if (total < 100) {
    const add = (100 - total) / next.length;
    next = next.map((value) => value + add);
  }

  const finalTotal = next.reduce((sum, value) => sum + value, 0);
  return next.map((value) => (value / finalTotal) * 100);
}

export function normalizeTableTrackSizes(value: unknown, count: number) {
  const safeCount = clampNumber(Math.round(count) || 1, 1, 24);
  const source = Array.isArray(value) ? value : [];
  const equal = 100 / safeCount;
  const raw = Array.from({ length: safeCount }, (_item, index) => {
    const numeric = Number(source[index]);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : equal;
  });
  const total = raw.reduce((sum, item) => sum + item, 0);
  return rebalanceTrackSizes(total > 0 ? raw.map((item) => (item / total) * 100) : equalTableTrackSizes(safeCount));
}

export function insertTableTrackSize(value: unknown, count: number, insertAt: number) {
  const sizes = normalizeTableTrackSizes(value, count);
  const nextSize = 100 / (sizes.length + 1);
  const scale = (100 - nextSize) / 100;
  const next = sizes.map((size) => size * scale);
  next.splice(clampNumber(insertAt, 0, next.length), 0, nextSize);
  return normalizeTableTrackSizes(next, sizes.length + 1);
}

export function deleteTableTrackSize(value: unknown, count: number, deleteAt: number) {
  const sizes = normalizeTableTrackSizes(value, count);
  if (sizes.length <= 1) {
    return sizes;
  }
  const next = sizes.filter((_size, index) => index !== clampNumber(deleteAt, 0, sizes.length - 1));
  return normalizeTableTrackSizes(next, next.length);
}

export function resizeAdjacentTableTracks(value: unknown, count: number, index: number, deltaPercent: number) {
  const sizes = normalizeTableTrackSizes(value, count);
  if (index < 0 || index >= sizes.length - 1) {
    return sizes;
  }

  const left = sizes[index];
  const right = sizes[index + 1];
  const delta = clampNumber(deltaPercent, minTrackPercent - left, right - minTrackPercent);
  const next = [...sizes];
  next[index] = left + delta;
  next[index + 1] = right - delta;
  return normalizeTableTrackSizes(next, sizes.length);
}

function visualLeftTrackIndex(count: number, boundaryIndex: number, direction: TableDirection) {
  return direction === "rtl" ? count - 1 - boundaryIndex : boundaryIndex;
}

function visualRightTrackIndex(count: number, boundaryIndex: number, direction: TableDirection) {
  return direction === "rtl" ? count - 2 - boundaryIndex : boundaryIndex + 1;
}

export function visualTrackStopsPercent(value: unknown, count: number, direction: TableDirection = "ltr") {
  const sizes = normalizeTableTrackSizes(value, count);
  const visualSizes = direction === "rtl" ? [...sizes].reverse() : sizes;
  return visualSizes.slice(0, -1).reduce<number[]>((stops, size) => {
    stops.push((stops[stops.length - 1] || 0) + size);
    return stops;
  }, []);
}

export function resizeVisualPixelTracks(value: unknown, count: number, boundaryIndex: number, deltaPx: number, direction: TableDirection = "ltr", minTrackPx = 20) {
  const safeCount = clampNumber(Math.round(count) || 1, 1, 24);
  const source = Array.isArray(value) ? value : [];
  const fallback = Math.max(minTrackPx, 80);
  const sizes = Array.from({ length: safeCount }, (_item, index) => {
    const numeric = Number(source[index]);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  });
  if (safeCount <= 1 || boundaryIndex < 0 || boundaryIndex >= safeCount - 1) {
    return sizes;
  }

  const leftIndex = visualLeftTrackIndex(safeCount, boundaryIndex, direction);
  const rightIndex = visualRightTrackIndex(safeCount, boundaryIndex, direction);
  const left = sizes[leftIndex];
  const right = sizes[rightIndex];
  const delta = clampNumber(deltaPx, minTrackPx - left, right - minTrackPx);
  const next = [...sizes];
  next[leftIndex] = Number((left + delta).toFixed(2));
  next[rightIndex] = Number((right - delta).toFixed(2));
  return next;
}

export function resizeVisualPercentTracks(value: unknown, count: number, boundaryIndex: number, deltaPx: number, tableSizePx: number, direction: TableDirection = "ltr", minTrackPx = 20) {
  const sizes = normalizeTableTrackSizes(value, count);
  const safeTableSize = Math.max(1, tableSizePx);
  const pixelSizes = sizes.map((size) => (size / 100) * safeTableSize);
  const resized = resizeVisualPixelTracks(pixelSizes, sizes.length, boundaryIndex, deltaPx, direction, minTrackPx);
  const total = resized.reduce((sum, size) => sum + size, 0);
  if (total <= 0) {
    return sizes;
  }
  return normalizeTableTrackSizes(resized.map((size) => (size / total) * 100), resized.length);
}

export function resizeTableOuterFrame(frame: TableFrame, edge: TableOuterResizeEdge, deltaMm: number, pageWidthMm: number, pageHeightMm: number) {
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const next = { ...frame };

  if (edge === "right") {
    next.width = clampNumber(frame.width + deltaMm, minTableFrameMm, pageWidthMm - frame.x);
  } else if (edge === "left") {
    next.x = clampNumber(frame.x + deltaMm, 0, right - minTableFrameMm);
    next.width = right - next.x;
  } else if (edge === "bottom") {
    next.height = clampNumber(frame.height + deltaMm, minTableFrameMm, pageHeightMm - frame.y);
  } else {
    next.y = clampNumber(frame.y + deltaMm, 0, bottom - minTableFrameMm);
    next.height = bottom - next.y;
  }

  return next;
}

export function splitAllTableCells(rows: NormalizedTableCell[][]): NormalizedTableCell[][] {
  return cloneTableRows(normalizeTableRows(rows)).map((row) => row.map((cell) => ({
    ...cell,
    colSpan: 1,
    hidden: false,
    rowSpan: 1
  })));
}

export function updateTableCell(rows: NormalizedTableCell[][], selection: CellCoordinate, next: Partial<NormalizedTableCell>): TableEditResult {
  const normalized = cloneTableRows(normalizeTableRows(rows));
  const safeSelection = clampTableSelection(normalized, selection);
  normalized[safeSelection.row][safeSelection.col] = {
    ...normalized[safeSelection.row][safeSelection.col],
    ...next,
    style: next.style ? cloneStyle(next.style) : normalized[safeSelection.row][safeSelection.col].style
  };
  return { rows: normalizeTableRows(normalized), selection: safeSelection };
}

export function insertTableRow(rows: NormalizedTableCell[][], selection: CellCoordinate, offset: 0 | 1): TableEditResult {
  const normalized = splitAllTableCells(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const columnCount = Math.max(normalized[0]?.length || 1, 1);
  const insertAt = clampNumber(safeSelection.row + offset, 0, normalized.length);
  normalized.splice(insertAt, 0, Array.from({ length: columnCount }, () => tableCell()));
  return { rows: normalizeTableRows(normalized), selection: { row: insertAt, col: 0 } };
}

export function deleteTableRow(rows: NormalizedTableCell[][], selection: CellCoordinate): TableEditResult {
  const normalized = splitAllTableCells(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  if (normalized.length <= 1) {
    return { rows: normalized, selection: safeSelection };
  }
  normalized.splice(safeSelection.row, 1);
  return { rows: normalizeTableRows(normalized), selection: { row: Math.max(0, safeSelection.row - 1), col: 0 } };
}

export function insertTableColumn(rows: NormalizedTableCell[][], selection: CellCoordinate, offset: 0 | 1): TableEditResult {
  const normalized = splitAllTableCells(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const insertAt = clampNumber(safeSelection.col + offset, 0, normalized[0]?.length || 0);
  normalized.forEach((row) => row.splice(insertAt, 0, tableCell()));
  return { rows: normalizeTableRows(normalized), selection: { row: safeSelection.row, col: insertAt } };
}

export function deleteTableColumn(rows: NormalizedTableCell[][], selection: CellCoordinate): TableEditResult {
  const normalized = splitAllTableCells(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  if ((normalized[0]?.length || 0) <= 1) {
    return { rows: normalized, selection: safeSelection };
  }
  normalized.forEach((row) => row.splice(safeSelection.col, 1));
  return { rows: normalizeTableRows(normalized), selection: { row: safeSelection.row, col: Math.max(0, safeSelection.col - 1) } };
}

function rectangleCanMerge(rows: NormalizedTableCell[][], selection: CellCoordinate, rowSpan: number, colSpan: number) {
  const normalized = normalizeTableRows(rows);
  const origin = normalized[selection.row]?.[selection.col];
  if (!origin || origin.hidden || selection.row + rowSpan > normalized.length || selection.col + colSpan > (normalized[0]?.length || 0)) {
    return false;
  }

  for (let row = selection.row; row < selection.row + rowSpan; row += 1) {
    for (let col = selection.col; col < selection.col + colSpan; col += 1) {
      if (row === selection.row && col === selection.col) {
        continue;
      }

      const coveredByOrigin = row < selection.row + origin.rowSpan && col < selection.col + origin.colSpan;
      const cell = normalized[row]?.[col];
      if (coveredByOrigin) {
        if (!cell?.hidden) {
          return false;
        }
        continue;
      }

      if (!cell || cell.hidden || cell.colSpan !== 1 || cell.rowSpan !== 1) {
        return false;
      }
    }
  }

  return true;
}

export function canMergeTableCellRight(rows: NormalizedTableCell[][], selection: CellCoordinate) {
  const normalized = normalizeTableRows(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const cell = normalized[safeSelection.row]?.[safeSelection.col];
  return Boolean(cell && rectangleCanMerge(normalized, safeSelection, cell.rowSpan, cell.colSpan + 1));
}

export function canMergeTableCellDown(rows: NormalizedTableCell[][], selection: CellCoordinate) {
  const normalized = normalizeTableRows(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const cell = normalized[safeSelection.row]?.[safeSelection.col];
  return Boolean(cell && rectangleCanMerge(normalized, safeSelection, cell.rowSpan + 1, cell.colSpan));
}

function mergeTableCell(rows: NormalizedTableCell[][], selection: CellCoordinate, rowSpan: number, colSpan: number): TableEditResult {
  const normalized = cloneTableRows(normalizeTableRows(rows));
  const safeSelection = clampTableSelection(normalized, selection);
  if (!rectangleCanMerge(normalized, safeSelection, rowSpan, colSpan)) {
    return { rows: normalized, selection: safeSelection };
  }

  const origin = normalized[safeSelection.row][safeSelection.col];
  origin.rowSpan = rowSpan;
  origin.colSpan = colSpan;

  for (let row = safeSelection.row; row < safeSelection.row + rowSpan; row += 1) {
    for (let col = safeSelection.col; col < safeSelection.col + colSpan; col += 1) {
      if (row === safeSelection.row && col === safeSelection.col) {
        continue;
      }
      normalized[row][col] = { ...normalized[row][col], colSpan: 1, content: "", hidden: true, rowSpan: 1 };
    }
  }

  return { rows: normalizeTableRows(normalized), selection: safeSelection };
}

export function mergeTableCellRight(rows: NormalizedTableCell[][], selection: CellCoordinate): TableEditResult {
  const normalized = normalizeTableRows(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const cell = normalized[safeSelection.row]?.[safeSelection.col];
  return cell ? mergeTableCell(normalized, safeSelection, cell.rowSpan, cell.colSpan + 1) : { rows: normalized, selection: safeSelection };
}

export function mergeTableCellDown(rows: NormalizedTableCell[][], selection: CellCoordinate): TableEditResult {
  const normalized = normalizeTableRows(rows);
  const safeSelection = clampTableSelection(normalized, selection);
  const cell = normalized[safeSelection.row]?.[safeSelection.col];
  return cell ? mergeTableCell(normalized, safeSelection, cell.rowSpan + 1, cell.colSpan) : { rows: normalized, selection: safeSelection };
}

export function splitTableCell(rows: NormalizedTableCell[][], selection: CellCoordinate): TableEditResult {
  const normalized = cloneTableRows(normalizeTableRows(rows));
  const safeSelection = clampTableSelection(normalized, selection);
  const cell = normalized[safeSelection.row]?.[safeSelection.col];
  if (!cell || cell.hidden || (cell.colSpan === 1 && cell.rowSpan === 1)) {
    return { rows: normalized, selection: safeSelection };
  }

  const colSpan = cell.colSpan;
  const rowSpan = cell.rowSpan;
  cell.colSpan = 1;
  cell.rowSpan = 1;

  for (let row = safeSelection.row; row < safeSelection.row + rowSpan; row += 1) {
    for (let col = safeSelection.col; col < safeSelection.col + colSpan; col += 1) {
      if (row === safeSelection.row && col === safeSelection.col) {
        continue;
      }
      normalized[row][col] = { ...normalized[row][col], colSpan: 1, hidden: false, rowSpan: 1 };
    }
  }

  return { rows: normalizeTableRows(normalized), selection: safeSelection };
}
