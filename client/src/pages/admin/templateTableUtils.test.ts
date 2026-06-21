import { describe, expect, it } from "vitest";
import {
  deleteTableTrackSize,
  insertTableColumn,
  insertTableRow,
  insertTableTrackSize,
  normalizeTableRows,
  serializeTableRows,
  tableCellDocument,
  tableInsertFrameAtPoint,
  updateTableCell
} from "./templateTableUtils";

describe("floating template table helpers", () => {
  it("converts legacy string cells to editable documents", () => {
    const cell = normalizeTableRows([["first\nsecond"]])[0][0];
    expect(tableCellDocument(cell)).toEqual({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "first" },
          { type: "hardBreak" },
          { type: "text", text: "second" }
        ]
      }]
    });
  });

  it("round-trips rich content through table edits", () => {
    const richContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }] }]
    };
    const rows = normalizeTableRows([[""]]);
    const updated = updateTableCell(rows, { row: 0, col: 0 }, { content: "", richContent }).rows;
    const serialized = serializeTableRows(updated);
    expect(typeof serialized[0][0]).toBe("object");
    expect(typeof serialized[0][0] === "object" ? serialized[0][0].richContent : null).toEqual(richContent);

    const withRow = insertTableRow(updated, { row: 0, col: 0 }, 1).rows;
    const withColumn = insertTableColumn(withRow, { row: 0, col: 0 }, 1).rows;
    expect(withColumn[0][0].richContent).toEqual(richContent);
  });

  it("keeps inserted and deleted track arrays synchronized", () => {
    const inserted = insertTableTrackSize([50, 50], 2, 1);
    expect(inserted).toHaveLength(3);
    expect(inserted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    const deleted = deleteTableTrackSize(inserted, 3, 1);
    expect(deleted).toHaveLength(2);
    expect(deleted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  it("clamps cursor placement so the table stays on the A4 page", () => {
    expect(tableInsertFrameAtPoint({ columns: 3, rows: 3, x: 205, y: 295, pageWidthMm: 210, pageHeightMm: 297 })).toEqual({
      columns: 3,
      height: 30,
      rows: 3,
      width: 90,
      x: 120,
      y: 267
    });
  });
});
