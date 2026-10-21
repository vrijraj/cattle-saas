import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { animals, bulls } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireFarm } from "@/lib/farm-context";
import { ancestorChart, type AnimalLink, type BullLink } from "@/lib/pedigree-tree";

function latin(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const farm = await requireFarm();
  if (farm.roles.length === 1 && farm.roles[0] === "worker") return new Response("Forbidden", { status: 403 });
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
  const page = pdf.addPage([595, 842]);
  const ink = rgb(0.11, 0.14, 0.19);
  page.drawText("Pedigree", { x: 48, y: 790, size: 18, font: bold, color: ink });
  page.drawText(latin(`${animal.name ?? animal.code} · ${animal.code}`), { x: 48, y: 764, size: 12, font, color: ink });

  const blocks: { label: string; node: { code: string | null; name: string | null } }[] = [
    { label: "Animal", node: chart.self },
    ...chart.parents.map((node, index) => ({ label: index === 0 ? "Sire" : "Dam", node })),
    ...chart.grandparents.map((node, index) => ({ label: `Grandparent ${index + 1}`, node })),
    ...chart.greatGrandparents.map((node, index) => ({ label: `Great-grandparent ${index + 1}`, node })),
    ...chart.fourthGeneration.filter((node) => node.code).map((node, index) => ({ label: `4th generation ${index + 1}`, node })),
  ];
  blocks.forEach((block, index) => {
    const y = 730 - index * 22;
    if (y < 48) return;
    const text = block.node.code ? latin(`${block.node.name ? `${block.node.name} · ` : ""}${block.node.code}`) : "Unknown";
    page.drawText(latin(block.label), { x: 48, y, size: 9, font: bold, color: ink });
    page.drawText(text, { x: 180, y, size: 11, font, color: ink });
  });

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
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${animal.code}-pedigree.pdf"`,
    },
  });
}
