import { downloadBlob } from "./downloads";

type WorkbookSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

export async function workbookBlob(sheets: WorkbookSheet[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    const headers = Object.keys(sheet.rows[0] || {});
    if (headers.length) {
      worksheet.addRow(headers);
      for (const row of sheet.rows) {
        worksheet.addRow(headers.map((header) => row[header] ?? ""));
      }
      worksheet.columns.forEach((column) => {
        column.width = 22;
      });
    }
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function downloadWorkbook(filename: string, sheets: WorkbookSheet[]) {
  downloadBlob(await workbookBlob(sheets), filename);
}
