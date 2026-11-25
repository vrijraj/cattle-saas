import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { farms, orderItems, orders, products } from "@/db/schema";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { verifyOrderAccessToken } from "@/lib/payments";

function pdfSafe(value: string) {
  return value.replace(/[^\x20-\x7E]/g, (ch) => (ch === "₹" ? "Rs. " : ch === "·" || ch === "—" || ch === "–" ? "-" : " "));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  if (!verifyOrderAccessToken(id, token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [farm] = await db.select().from(farms).where(eq(farms.slug, slug)).limit(1);
  if (!farm) return new NextResponse("Not found", { status: 404 });

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.farmId, farm.id)))
    .limit(1);
  if (!order) return new NextResponse("Not found", { status: 404 });

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const productRows = await db.select({ id: products.id, gstPercent: products.gstPercent }).from(products).where(eq(products.farmId, farm.id));
  const gstByProduct = new Map(productRows.map((p) => [p.id, Number(p.gstPercent ?? 0)]));

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, x: number, y: number, size = 10, isBold = false, color = rgb(0.1, 0.1, 0.12)) => {
    page.drawText(pdfSafe(text), { x, y, size, font: isBold ? bold : font, color });
  };

  let y = 790;
  draw("TAX INVOICE / ORDER RECEIPT", 48, y, 16, true, rgb(0.06, 0.36, 0.2));
  draw(farm.name, 48, y - 20, 12, true);
  if (farm.enquiryEmail) draw(`Email: ${farm.enquiryEmail}`, 48, y - 34, 9, false, rgb(0.35, 0.35, 0.4));
  if (farm.whatsappNumber) draw(`WhatsApp / Phone: ${farm.whatsappNumber}`, 48, y - 46, 9, false, rgb(0.35, 0.35, 0.4));

  draw(`Invoice #: INV-${order.id.slice(0, 8).toUpperCase()}`, 380, y, 10, true);
  draw(`Date: ${formatDisplayDate(farmToday(farm.timezone, order.createdAt))}`, 380, y - 16, 9);
  draw(`Status: ${order.status.replaceAll("_", " ").toUpperCase()}`, 380, y - 30, 9);

  y -= 80;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.75, color: rgb(0.85, 0.85, 0.88) });
  y -= 20;

  draw("Bill & Ship To:", 48, y, 10, true);
  draw(order.customerName, 48, y - 15, 10);
  draw(`Phone: ${order.phone}`, 48, y - 29, 9, false, rgb(0.35, 0.35, 0.4));
  draw(`Address: ${order.address.slice(0, 90)}`, 48, y - 43, 9, false, rgb(0.35, 0.35, 0.4));

  y -= 75;
  page.drawRectangle({ x: 48, y: y - 6, width: 499, height: 22, color: rgb(0.94, 0.95, 0.96) });
  draw("Item", 54, y, 9, true);
  draw("Qty", 300, y, 9, true);
  draw("Unit (Rs.)", 345, y, 9, true);
  draw("GST %", 420, y, 9, true);
  draw("Line Total", 475, y, 9, true);
  y -= 24;

  let taxableSubtotal = 0;
  let totalGst = 0;

  for (const line of lines) {
    const unit = Number(line.price);
    const lineTotal = unit * line.quantity;
    const gstRate = line.productId ? (gstByProduct.get(line.productId) ?? 0) : 0;
    const basePart = gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal;
    const gstPart = lineTotal - basePart;
    taxableSubtotal += basePart;
    totalGst += gstPart;

    draw(line.name.slice(0, 42), 54, y, 9);
    draw(String(line.quantity), 304, y, 9);
    draw(unit.toFixed(2), 345, y, 9);
    draw(`${gstRate.toFixed(0)}%`, 422, y, 9);
    draw(`Rs. ${lineTotal.toFixed(2)}`, 475, y, 9);
    y -= 18;
    if (y < 140) break;
  }

  y -= 10;
  page.drawLine({ start: { x: 320, y }, end: { x: 547, y }, thickness: 0.75, color: rgb(0.82, 0.82, 0.86) });
  y -= 18;

  draw("Taxable value (incl. breakdown):", 320, y, 9);
  draw(`Rs. ${taxableSubtotal.toFixed(2)}`, 475, y, 9);
  y -= 15;
  draw("Included GST (CGST + SGST):", 320, y, 9);
  draw(`Rs. ${totalGst.toFixed(2)}`, 475, y, 9);
  y -= 18;
  draw("Grand Total:", 320, y, 11, true);
  draw(`Rs. ${Number(order.amount).toFixed(2)}`, 470, y, 11, true, rgb(0.06, 0.36, 0.2));

  draw("Computer-generated receipt. Thank you for supporting direct dairy farming.", 48, 60, 8, false, rgb(0.45, 0.45, 0.5));

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${order.id.slice(0, 8)}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
