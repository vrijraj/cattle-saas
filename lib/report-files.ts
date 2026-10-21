import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function latin(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

export function csvFile(lines: string[][]) {
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

export async function excelFile(lines: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Report");
  for (const line of lines) sheet.addRow(line);
  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function pdfFile(title: string, lines: string[][]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const header = lines[0] ?? [];
  const body = lines.slice(1);
  const pageSize = body.length === 0 ? [[]] : chunk(body, 28);
  const pages = pageSize.length === 0 ? [[]] : pageSize;

  for (const slice of pages) {
    const page = pdf.addPage([842, 595]);
    page.drawText(latin(title), { x: 36, y: 560, size: 16, font: bold, color: rgb(0.11, 0.14, 0.19) });
    const rows = [header, ...slice];
    rows.forEach((line, index) => {
      const text = latin(line.map((cell) => cell.slice(0, 24)).join("   "));
      page.drawText(text, {
        x: 36,
        y: 528 - index * 16,
        size: 9,
        font: index === 0 ? bold : font,
        color: rgb(0.11, 0.14, 0.19),
      });
    });
  }

  return Buffer.from(await pdf.save());
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}
