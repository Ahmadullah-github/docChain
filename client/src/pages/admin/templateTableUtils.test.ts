import { describe, expect, it } from "vitest";
import {
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
  resizeAdjacentTableTracks,
  resizeTableOuterFrame,
  resizeVisualPercentTracks,
  resizeVisualPixelTracks,
  splitTableCell,
  tableCell,
  visualTrackStopsPercent
} from "./templateTableUtils";

describe("template table utilities", () => {
  it("normalizes old string tables and uneven rows into a rectangle", () => {
    const rows = normalizeTableRows([
      ["A", "B"],
      ["C"]
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(2);
    expect(rows[0][0].content).toBe("A");
    expect(rows[1][1].content).toBe("");
  });

  it("merges right and splits the merged cell", () => {
    const rows = normalizeTableRows([["A", "B"], ["C", "D"]]);
    const merged = mergeTableCellRight(rows, { row: 0, col: 0 });

    expect(merged.rows[0][0].colSpan).toBe(2);
    expect(merged.rows[0][1].hidden).toBe(true);

    const split = splitTableCell(merged.rows, merged.selection);
    expect(split.rows[0][0].colSpan).toBe(1);
    expect(split.rows[0][1].hidden).toBe(false);
  });

  it("merges down after a horizontal merge to form a rectangle", () => {
    const rows = normalizeTableRows([
      ["A", "B"],
      ["C", "D"]
    ]);
    const wide = mergeTableCellRight(rows, { row: 0, col: 0 });
    const rectangle = mergeTableCellDown(wide.rows, wide.selection);

    expect(rectangle.rows[0][0].colSpan).toBe(2);
    expect(rectangle.rows[0][0].rowSpan).toBe(2);
    expect(rectangle.rows[1][0].hidden).toBe(true);
    expect(rectangle.rows[1][1].hidden).toBe(true);
  });

  it("inserts and deletes rows around merged cells without leaving orphan hidden cells", () => {
    const rows = mergeTableCellRight(normalizeTableRows([["A", "B"], ["C", "D"]]), { row: 0, col: 0 }).rows;
    const inserted = insertTableRow(rows, { row: 0, col: 0 }, 1);
    const deleted = deleteTableRow(inserted.rows, inserted.selection);

    expect(deleted.rows).toHaveLength(2);
    expect(deleted.rows.flat().every((cell) => !cell.hidden)).toBe(true);
  });

  it("inserts and deletes columns around merged cells while preserving selection", () => {
    const rows = mergeTableCellDown(normalizeTableRows([["A", "B"], ["C", "D"]]), { row: 0, col: 0 }).rows;
    const inserted = insertTableColumn(rows, { row: 0, col: 0 }, 1);
    const deleted = deleteTableColumn(inserted.rows, inserted.selection);

    expect(deleted.selection).toEqual({ row: 0, col: 0 });
    expect(deleted.rows[0]).toHaveLength(2);
    expect(deleted.rows.flat().every((cell) => !cell.hidden)).toBe(true);
  });

  it("keeps per-cell style during normalization", () => {
    const rows = normalizeTableRows([[{ ...tableCell("A"), style: { fontWeight: "700", textAlign: "right" } }]]);

    expect(rows[0][0].style).toEqual({ fontWeight: "700", textAlign: "right" });
  });

  it("defaults missing track sizes to equal percentages", () => {
    const sizes = normalizeTableTrackSizes(undefined, 4);

    expect(sizes).toHaveLength(4);
    expect(sizes.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(sizes[0]).toBeCloseTo(25);
  });

  it("normalizes invalid track size arrays", () => {
    const sizes = normalizeTableTrackSizes([20, "bad", -1], 3);

    expect(sizes).toHaveLength(3);
    expect(sizes.every((size) => size > 0)).toBe(true);
    expect(sizes.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  it("inserts and deletes track sizes with table structure changes", () => {
    const inserted = insertTableTrackSize([30, 70], 2, 1);
    const deleted = deleteTableTrackSize(inserted, 3, 1);

    expect(inserted).toHaveLength(3);
    expect(inserted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(deleted).toHaveLength(2);
    expect(deleted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  it("resizes adjacent tracks while respecting minimum cell sizes", () => {
    const resized = resizeAdjacentTableTracks(equalTableTrackSizes(2), 2, 0, 20);
    const clamped = resizeAdjacentTableTracks(equalTableTrackSizes(2), 2, 0, 100);

    expect(resized[0]).toBeCloseTo(70);
    expect(resized[1]).toBeCloseTo(30);
    expect(clamped[0]).toBeCloseTo(96);
    expect(clamped[1]).toBeCloseTo(4);
  });

  it("resizes visual pixel tracks in LTR without direction inversion", () => {
    const resized = resizeVisualPixelTracks([100, 100, 100], 3, 0, 20, "ltr", 32);

    expect(resized).toEqual([120, 80, 100]);
  });

  it("resizes visual pixel tracks in RTL without direction inversion", () => {
    const resized = resizeVisualPixelTracks([100, 100, 100], 3, 0, 20, "rtl", 32);

    expect(resized).toEqual([100, 80, 120]);
  });

  it("resizes visual percent tracks and preserves total size", () => {
    const resized = resizeVisualPercentTracks([33.33, 33.33, 33.34], 3, 1, -30, 300, "rtl", 30);

    expect(resized.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(resized[1]).toBeLessThan(33.33);
    expect(resized[0]).toBeGreaterThan(33.33);
  });

  it("reports visual track stops according to document direction", () => {
    expect(visualTrackStopsPercent([20, 30, 50], 3, "ltr")).toEqual([20, 50]);
    expect(visualTrackStopsPercent([20, 30, 50], 3, "rtl")).toEqual([50, 80]);
  });

  it("resizes outer table frames within the page bounds", () => {
    const frame = { height: 30, width: 50, x: 20, y: 20 };
    const left = resizeTableOuterFrame(frame, "left", 10, 210, 297);
    const right = resizeTableOuterFrame(frame, "right", 300, 210, 297);
    const top = resizeTableOuterFrame(frame, "top", -40, 210, 297);

    expect(left).toEqual({ height: 30, width: 40, x: 30, y: 20 });
    expect(right.width).toBe(190);
    expect(top.y).toBe(0);
    expect(top.height).toBe(50);
  });
});
