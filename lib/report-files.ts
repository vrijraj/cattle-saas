import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function safeCsvValue(value: string) {
  const isFormula = /^[=@\t\r]/.test(value) || (/^[+-]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value));
  const sanitized = isFormula ? `'${value}` : value;
  return `"${sanitized.replaceAll('"', '""')}"`;
}

export function pdfSafeText(value: string) {
  return value
    .replaceAll("·", " - ")
    .replaceAll("₹", "Rs. ")
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("×", "x")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replace(/[^\x20-\x7E]/g, " ");
}

export function csvFile(lines: string[][]) {
  return `\uFEFF${lines.map((line) => line.map(safeCsvValue).join(",")).join("\n")}`;
}

export async function excelFile(lines: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Report");
  lines.forEach((line, rowIndex) => {
    if (rowIndex === 0) {
      const headerRow = sheet.addRow(line);
      headerRow.font = { bold: true };
      return;
    }
    const typed = line.map((cell) => {
      if (/^[+-]?\d+(\.\d+)?$/.test(cell.trim())) {
        const num = Number(cell.trim());
        if (Number.isFinite(num)) return num;
      }
      return cell;
    });
    sheet.addRow(typed);
  });
  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function pdfFile(title: string, lines: string[][]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const header = lines[0] ?? [];
  const body = lines.slice(1);
  const slices = body.length === 0 ? [[]] : chunk(body, 28);
  const colCount = Math.max(header.length, 1);
  const usableWidth = 770;
  const colWidth = usableWidth / colCount;
  const maxChars = Math.max(8, Math.floor(colWidth / 5.2));
  const ink = rgb(0.11, 0.14, 0.19);
  const muted = rgb(0.45, 0.49, 0.55);

  slices.forEach((slice, pageIndex) => {
    const page = pdf.addPage([842, 595]);
    page.drawText(pdfSafeText(title), { x: 36, y: 560, size: 15, font: bold, color: ink });
    page.drawText(`Page ${pageIndex + 1} of ${slices.length}`, { x: 740, y: 562, size: 8, font, color: muted });
    const rows = [header, ...slice];
    rows.forEach((line, rowIndex) => {
      const y = 530 - rowIndex * 16;
      const isHeader = rowIndex === 0;
      line.forEach((cell, colIndex) => {
        const clean = pdfSafeText(cell);
        const clipped = clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}.` : clean;
        page.drawText(clipped, {
          x: 36 + colIndex * colWidth,
          y,
          size: colCount > 10 ? 7.5 : 8.5,
          font: isHeader ? bold : font,
          color: ink,
        });
      });
    });
  });

  return Buffer.from(await pdf.save());
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}
