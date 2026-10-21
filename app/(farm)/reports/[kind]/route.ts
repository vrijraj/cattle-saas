import { requireFarm } from "@/lib/farm-context";
import { canRecordHealth, canViewFinance } from "@/lib/permissions";
import { reportRows } from "@/lib/report-data";
import { csvFile, excelFile, pdfFile } from "@/lib/report-files";

const titles: Record<string, string> = {
  cattle: "Cattle register",
  breeding: "Breeding and AI",
  milk: "Milk",
  health: "Health and vaccination",
  feed: "Feed stock",
  semen: "Semen inventory",
  finance: "Finance",
};

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const farm = await requireFarm();
  const { kind } = await context.params;
  if (kind === "health" && !canRecordHealth(farm.roles) && !farm.roles.includes("owner") && !farm.roles.includes("manager")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (kind === "finance" && !canViewFinance(farm.roles)) return new Response("Forbidden", { status: 403 });
  if (farm.roles.length === 1 && farm.roles[0] === "worker") return new Response("Forbidden", { status: 403 });

  const lines = await reportRows(kind, farm.farmId);
  if (!lines) return new Response("Unknown report", { status: 404 });

  const format = new URL(request.url).searchParams.get("format") ?? "csv";
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
