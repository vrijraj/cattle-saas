import { requireFarm } from "@/lib/farm-context";
import { canOpenReport, reportRows, reportWindow } from "@/lib/report-data";
import { csvFile, excelFile, pdfFile } from "@/lib/report-files";
import { writeAudit } from "@/lib/audit";
import { db } from "@/db";

const titles: Record<string, string> = {
  cattle: "Cattle register",
  breeding: "Breeding and AI",
  milk: "Milk",
  health: "Health and vaccination",
  feed: "Feed stock",
  semen: "Semen inventory",
  weight: "Weight",
  finance: "Finance",
  embryos: "Embryos",
  genetics: "Bull performance",
};

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const farm = await requireFarm();
  const { kind } = await context.params;
  if (!titles[kind]) return new Response("Unknown report", { status: 404 });
  if (!canOpenReport(kind, farm.roles)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const window = reportWindow(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const scope = {
    roles: farm.roles,
    from: window.from,
    to: window.to,
    presence: url.searchParams.get("presence") ?? undefined,
    sex: url.searchParams.get("sex") ?? undefined,
    breed: url.searchParams.get("breed") ?? undefined,
  };
  const lines = await reportRows(kind, farm.farmId, scope);
  if (!lines) return new Response("Unknown report", { status: 404 });

  const format = url.searchParams.get("format") ?? "csv";
  await writeAudit(db, {
    farmId: farm.farmId,
    actorId: farm.userId,
    action: "export",
    entity: "export",
    entityId: kind,
    summary: `Downloaded ${titles[kind] ?? kind} as ${format}`,
    after: { kind, format, from: scope.from ?? null, to: scope.to ?? null, presence: scope.presence ?? null, sex: scope.sex ?? null, breed: scope.breed ?? null },
  });
  if (format === "xlsx") {
    const body = await excelFile(lines);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}.xlsx"`,
      },
    });
  }
  if (format === "pdf") {
    const body = await pdfFile(titles[kind] ?? kind, lines);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${kind}.pdf"`,
      },
    });
  }

  return new Response(csvFile(lines), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
    },
  });
}
