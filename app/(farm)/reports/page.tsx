import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { breeds } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { formatDisplayDate } from "@/lib/dates";
import { presenceLabel, sexLabel } from "@/lib/labels";
import { canViewGenetics, canViewReports, canViewSemen } from "@/lib/permissions";
import { canOpenReport, reportCharts, reportFacts, reportRows, reportWindow } from "@/lib/report-data";
import { EmptyRow, Summary, TabBar, Table, Td } from "@/components/workspace";

const reports = [
  { id: "cattle", label: "Cattle", detail: "Animals by breed, including animals that have left the farm." },
  { id: "breeding", label: "Breeding", detail: "Inseminations, pregnancy checks, and calvings." },
  { id: "milk", label: "Milk", detail: "Morning and evening litres by animal. A voided entry is left out." },
  { id: "health", label: "Health", detail: "Treatments, vaccines, and deworming." },
  { id: "feed", label: "Feed", detail: "Stock movements. The chart is the quantity on hand." },
  { id: "semen", label: "Semen", detail: "Straws by status." },
  { id: "weight", label: "Weight", detail: "Weighings by animal." },
  { id: "finance", label: "Finance", detail: "Income and expense. Voided rows stay in the table and out of the chart." },
  { id: "embryos", label: "Embryos", detail: "Embryos by status." },
  { id: "genetics", label: "Genetics", detail: "Bull performance." },
] as const;

type ReportId = (typeof reports)[number]["id"];

const dated = new Set<ReportId>(["breeding", "milk", "health", "feed", "weight", "finance"]);

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; presence?: string; sex?: string; breed?: string }>;
}) {
  const farm = await requireFarm();
  if (!canViewReports(farm.roles)) redirect("/dashboard");
  const visible = reports.filter((report) => canOpenReport(report.id, farm.roles));
  const query = await searchParams;
  const tab = (visible.some((report) => report.id === query.tab) ? query.tab : visible[0]?.id ?? "cattle") as ReportId;
  const current = visible.find((report) => report.id === tab) ?? visible[0];
  const window = reportWindow(query.from, query.to);
  const scope = { roles: farm.roles, from: window.from, to: window.to, presence: query.presence, sex: query.sex, breed: query.breed };
  const lines = current ? await reportRows(current.id, farm.farmId, scope) : null;
  const header = lines?.[0] ?? [];
  const body = lines?.slice(1) ?? [];
  const facts = reportFacts(current?.id ?? "cattle", body);
  const charts = current ? reportCharts(current.id, body) : [];
  const preview = body.slice(0, 8);
  const breedRows = current?.id === "cattle" ? await db.select().from(breeds).where(eq(breeds.farmId, farm.farmId)) : [];
  const genetics = canViewGenetics(farm.roles);
  const semen = canViewSemen(farm.roles);
  const filtered = Boolean(window.from || window.to || query.presence || query.sex || query.breed);

  return (
    <div className="space-y-5">
      <Summary
        title="Reports"
        description="Each register shows the main figures, charts, and a download for CSV, Excel, or PDF. The file uses the filters on this page."
        facts={facts}
        action={
          filtered && current ? (
            <Link href={`/reports?tab=${current.id}`} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
              Clear
            </Link>
          ) : null
        }
      />
      <TabBar tabs={visible.map((report) => ({ id: report.id, label: report.label }))} current={tab} base="/reports" />

      {current ? (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{current.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{current.detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DownloadLink href={fileHref(current.id, "", scope)} label="Download CSV" />
              <DownloadLink href={fileHref(current.id, "pdf", scope)} label="Download PDF" />
              <DownloadLink href={fileHref(current.id, "xlsx", scope)} label="Download Excel" primary />
            </div>
          </div>

          {current.id === "cattle" || dated.has(current.id) ? (
            <form className="flex flex-wrap items-end gap-2" method="get">
              <input name="tab" type="hidden" value={current.id} />
              {dated.has(current.id) ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">From</span>
                    <input className="h-10 rounded-lg border border-border bg-background px-3" name="from" type="date" defaultValue={window.from ?? ""} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">To</span>
                    <input className="h-10 rounded-lg border border-border bg-background px-3" name="to" type="date" defaultValue={window.to ?? ""} />
                  </label>
                </>
              ) : (
                <>
                  <FilterSelect name="presence" label="Presence" value={query.presence} options={presenceLabel} />
                  <FilterSelect name="sex" label="Sex" value={query.sex} options={sexLabel} />
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Breed</span>
                    <select className="h-10 rounded-lg border border-border bg-background px-3" name="breed" defaultValue={query.breed ?? ""}>
                      <option value="">All breeds</option>
                      {breedRows.map((breed) => (
                        <option key={breed.id} value={breed.id}>
                          {breed.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <button className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                Apply
              </button>
            </form>
          ) : null}

          {charts.length === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-8 text-sm text-muted-foreground">
              {filtered && body.length === 0
                ? "Nothing is filled in for this filter."
                : current.id === "finance" && body.length > 0
                  ? "The chart uses active rows. Voided rows stay in the table."
                  : "Nothing recorded in this register yet."}
            </p>
          ) : (
            <div className={`grid gap-4 ${charts.length > 1 ? "lg:grid-cols-2" : ""}`}>
              {charts.map((chart) => (
                <article key={chart.title} className={`rounded-2xl border border-border p-4 ${chart.shape === "columns" ? "lg:col-span-2" : ""}`}>
                  <h3 className="text-sm font-semibold">{chart.title}</h3>
                  {chart.note ? <p className="mt-1 text-xs text-muted-foreground">{chart.note}</p> : null}
                  {chart.shape === "columns" ? <ColumnChart items={chart.items} /> : <BarChart items={chart.items} />}
                </article>
              ))}
            </div>
          )}

          <Table headers={header.length > 0 ? header : ["Register"]}>
            {preview.length === 0 ? <EmptyRow cols={Math.max(header.length, 1)}>No rows to show.</EmptyRow> : null}
            {preview.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <Td key={`${cellIndex}`} className="whitespace-nowrap">
                    <ReportCell value={cell} genetics={genetics} semen={semen} />
                  </Td>
                ))}
              </tr>
            ))}
          </Table>
          {body.length > preview.length ? (
            <p className="text-sm text-muted-foreground">
              Showing {preview.length} of {body.length} rows. Download the file for the full register.
              {window.from || window.to ? ` Dates run ${window.from ? formatDisplayDate(window.from) : "from the start"} to ${window.to ? formatDisplayDate(window.to) : "the latest"}.` : ""}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function BarChart({ items }: { items: { label: string; display: string; width: number }[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
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
  );
}

function ColumnChart({ items }: { items: { label: string; display: string; width: number }[] }) {
  return (
    <div className="mt-4">
      <div className="flex h-32 items-end gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 items-end">
            <div className="w-full rounded-t-md bg-primary" style={{ height: `${item.width}%` }} title={`${item.label}: ${item.display}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {items.map((item) => (
          <span key={item.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">
            {item.label.replace(/ \d{4}$/, "")}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: Record<string, string> }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <select className="h-10 rounded-lg border border-border bg-background px-3" name={name} defaultValue={value ?? ""}>
        <option value="">All</option>
        {Object.entries(options).map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportCell({ value, genetics, semen }: { value: string; genetics: boolean; semen: boolean }) {
  if (!value) return <>—</>;
  const parts = value.split(/(\s·\s|\s+)/);
  return (
    <>
      {parts.map((part, index) => {
        const href = codeHref(part, genetics, semen);
        return href ? (
          <Link key={`${part}-${index}`} href={href} className="hover:underline">
            {part}
          </Link>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </>
  );
}

function codeHref(value: string, genetics: boolean, semen: boolean) {
  if (!/^[A-Z]{2,6}(?:-[A-Z0-9]+)+$/.test(value)) return null;
  if (value.startsWith("STR-")) return `/scan?code=${encodeURIComponent(value)}`;
  if (value.startsWith("BULL-")) {
    if (genetics) return `/genetics?tab=bulls&sire=${encodeURIComponent(value)}`;
    if (semen) return `/semen?q=${encodeURIComponent(value)}`;
    return null;
  }
  if (value.startsWith("MIL-") || value.startsWith("NAV-")) return `/animals/${value}`;
  return null;
}

function fileHref(kind: string, format: string, scope: { from?: string; to?: string; presence?: string; sex?: string; breed?: string }) {
  const query = new URLSearchParams();
  if (format) query.set("format", format);
  if (scope.from) query.set("from", scope.from);
  if (scope.to) query.set("to", scope.to);
  if (scope.presence) query.set("presence", scope.presence);
  if (scope.sex) query.set("sex", scope.sex);
  if (scope.breed) query.set("breed", scope.breed);
  const text = query.toString();
  return `/reports/${kind}${text ? `?${text}` : ""}`;
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
