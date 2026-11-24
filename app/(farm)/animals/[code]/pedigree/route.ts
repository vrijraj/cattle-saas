import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { animals, bulls } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getFarm } from "@/lib/farm-context";
import { ancestorChart, type AnimalLink, type BullLink } from "@/lib/pedigree-tree";
import { canExportPedigree } from "@/lib/permissions";
import { pdfSafeText } from "@/lib/report-files";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const farm = await getFarm();
  if (!farm) return new Response("Unauthorized", { status: 401 });
  if (!canExportPedigree(farm.roles)) return new Response("Forbidden", { status: 403 });
  const { code } = await context.params;
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const animal = herd.find((row) => row.code === code);
  if (!animal) return new Response("Unknown animal", { status: 404 });
  const bullRows = await db.select().from(bulls).where(eq(bulls.farmId, farm.farmId));
  const links: AnimalLink[] = herd.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    geneticDamId: row.geneticDamId,
    geneticSireCode: row.geneticSireCode,
    geneticSireName: row.geneticSireName,
    presence: row.presence,
  }));
  const bullLinks: BullLink[] = bullRows.map((bull) => ({
    code: bull.code,
    name: bull.name,
    sireCode: bull.sireCode,
    damCode: bull.damCode,
  }));
  const chart = ancestorChart(links.find((row) => row.id === animal.id) ?? links[0], links, bullLinks);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.19);
  const muted = rgb(0.45, 0.49, 0.55);

  const blocks: { label: string; node: { code: string | null; name: string | null } }[] = [
    { label: "Animal", node: chart.self },
    ...chart.parents.map((node, index) => ({ label: index === 0 ? "Sire" : "Dam", node })),
    ...chart.grandparents.map((node, index) => ({ label: `Grandparent ${index + 1}`, node })),
    ...chart.greatGrandparents.map((node, index) => ({ label: `Great-grandparent ${index + 1}`, node })),
    ...chart.generations.slice(3).flatMap((nodes, index) =>
      nodes.filter((node) => node.code && !node.repeat).map((node, nodeIndex) => ({ label: `Gen ${index + 4} #${nodeIndex + 1}`, node })),
    ),
  ];

  const rowsPerPage = 31;
  const totalPages = Math.max(1, Math.ceil(blocks.length / rowsPerPage));
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText("Pedigree", { x: 48, y: 790, size: 18, font: bold, color: ink });
    page.drawText(pdfSafeText(`${animal.name ?? animal.code} · ${animal.code}`), { x: 48, y: 764, size: 12, font, color: ink });
    if (totalPages > 1) {
      page.drawText(`Page ${pageIdx + 1} of ${totalPages}`, { x: 490, y: 794, size: 9, font, color: muted });
    }
    const slice = blocks.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
    slice.forEach((block, index) => {
      const y = 730 - index * 22;
      const text = block.node.code ? pdfSafeText(`${block.node.name ? `${block.node.name} · ` : ""}${block.node.code}`) : "Unknown";
      page.drawText(pdfSafeText(block.label), { x: 48, y, size: 9, font: bold, color: ink });
      page.drawText(text, { x: 180, y, size: 11, font, color: ink });
    });
  }

  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "export",
    entity: "export",
    entityId: animal.id,
    summary: `Downloaded pedigree PDF for ${animal.code}`,
    after: { kind: "pedigree", format: "pdf", code: animal.code },
  });

  const body = await pdf.save();
  const safeCode = animal.code.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeCode}-pedigree.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
