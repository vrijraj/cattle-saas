import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireFarm } from "@/lib/farm-context";
import { formatDisplayDate } from "@/lib/dates";
import { canRecordHealth, canViewFinance, canViewReports } from "@/lib/permissions";
import { reportRows } from "@/lib/report-data";
import { EmptyRow, pickTab, Summary, TabBar, Table, Td } from "@/components/workspace";

const reports = [
  { id: "cattle", label: "Cattle", detail: "Animals by breed", chart: "breed" },
  { id: "breeding", label: "Breeding", detail: "Inseminations by bull", chart: "bull" },
  { id: "milk", label: "Milk", detail: "Litres by day", chart: "milk" },
  { id: "health", label: "Health", detail: "Records by type", chart: "type" },
  { id: "feed", label: "Feed", detail: "Quantity by item", chart: "feed" },
  { id: "semen", label: "Semen", detail: "Straws by status", chart: "status" },
  { id: "weight", label: "Weight", detail: "Weighings by animal", chart: "weight" },
  { id: "finance", label: "Finance", detail: "Amount by type", chart: "money" },
  { id: "embryos", label: "Embryos", detail: "Embryos by status", chart: "status" },
  { id: "genetics", label: "Genetics", detail: "Offspring by sire", chart: "sire" },
] as const;

type ReportId = (typeof reports)[number]["id"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const farm = await requireFarm();
  if (!canViewReports(farm.roles)) redirect("/dashboard");
  const visible = reports.filter((report) => canOpen(report.id, farm.roles));
  const query = await searchParams;
  const tab = pickTab(query.tab, visible, visible[0]?.id ?? "cattle") as ReportId;
  const current = visible.find((report) => report.id === tab) ?? visible[0];
  const lines = current ? await reportRows(current.id, farm.farmId) : null;
  const header = lines?.[0] ?? [];
  const body = lines?.slice(1) ?? [];
  const series = current ? chartSeries(current.id, body) : [];
  const preview = body.slice(0, 8);

  return (
    <div className="space-y-5">
      <Summary
        title="Reports"
        description="Each register has a chart and a download for CSV, Excel, or PDF."
        facts={[{ label: "Rows", value: String(body.length) }]}
      />
      <TabBar tabs={visible.map((report) => ({ id: report.id, label: report.label }))} current={tab} base="/reports" />

      {current ? (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{current.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{current.detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DownloadLink href={`/reports/${current.id}`} label="Download CSV" />
              <DownloadLink href={`/reports/${current.id}?format=pdf`} label="Download PDF" />
              <DownloadLink href={`/reports/${current.id}?format=xlsx`} label="Download Excel" primary />
            </div>
          </div>

          {series.length === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-8 text-sm text-muted-foreground">Nothing recorded in this register yet.</p>
          ) : (
            <ul className="space-y-3">
              {series.map((item) => (
                <li key={item.label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{item.label}</span>
                    <span className="shrink-0 text-muted-foreground">{item.display}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${item.width}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Table headers={header.length > 0 ? header : ["Register"]}>
            {preview.length === 0 ? <EmptyRow cols={Math.max(header.length, 1)}>No rows to show.</EmptyRow> : null}
            {preview.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <Td key={`${cellIndex}`} className="whitespace-nowrap">
                    {cell || "—"}
                  </Td>
                ))}
              </tr>
            ))}
          </Table>
          {body.length > preview.length ? (
            <p className="text-sm text-muted-foreground">Showing {preview.length} of {body.length} rows. Download the file for the full register.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DownloadLink({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ${
        primary ? "bg-primary text-primary-foreground" : "border border-border bg-background"
      }`}
    >
      <Download className="size-4" />
      {label}
    </Link>
  );
}

function canOpen(kind: ReportId, roles: string[]) {
  if (kind === "health" && !canRecordHealth(roles) && !roles.includes("owner") && !roles.includes("manager")) return false;
  if (kind === "finance" && !canViewFinance(roles)) return false;
  return true;
}

function chartSeries(kind: ReportId, rows: string[][]) {
  const counted =
    kind === "cattle"
      ? countBy(rows, 2)
      : kind === "breeding" || kind === "weight"
        ? countBy(rows, 1)
        : kind === "health"
          ? countBy(rows, 0)
            : kind === "semen" || kind === "embryos"
              ? countBy(rows, 1)
              : kind === "genetics"
                ? countBy(rows, 0)
            : kind === "milk"
              ? sumBy(rows, 0, (row) => Number(row[2] || 0) + Number(row[3] || 0))
              : kind === "feed"
                ? sumBy(rows, 1, (row) => Number(row[3] || 0))
                : sumBy(rows, 1, (row) => Number(row[3] || 0));

  const top = [...counted.entries()]
    .filter(([label]) => label !== "")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(...top.map(([, value]) => value), 1);
  return top.map(([label, value]) => ({
    label: prettyLabel(kind, label),
    display: prettyValue(kind, value),
    width: Math.max(6, Math.round((value / max) * 100)),
  }));
}

function countBy(rows: string[][], index: number) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row[index] || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sumBy(rows: string[][], index: number, valueOf: (row: string[]) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row[index] || "Unknown";
    totals.set(key, (totals.get(key) ?? 0) + valueOf(row));
  }
  return totals;
}

function prettyLabel(kind: ReportId, label: string) {
  if (kind === "milk" && /^\d{4}-\d{2}-\d{2}$/.test(label)) return formatDisplayDate(label);
  return label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettyValue(kind: ReportId, value: number) {
  if (kind === "finance") return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (kind === "milk" || kind === "feed") return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  if (kind === "weight") return `${value} records`;
  return String(value);
}
