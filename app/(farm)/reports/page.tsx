import Link from "next/link";
import { requireFarm } from "@/lib/farm-context";
import { Summary } from "@/components/workspace";

const reports = [
  ["cattle", "Cattle register", "Identity, status, sire, and dam"],
  ["breeding", "Breeding and AI", "Inseminations and pregnancy work"],
  ["milk", "Milk", "Recorded yields"],
  ["health", "Health and vaccination", "Treatments and doses"],
  ["feed", "Feed stock", "Items and movements"],
  ["semen", "Semen inventory", "Straws and tanks"],
  ["finance", "Finance", "Income and expense"],
];

export default async function ReportsPage() {
  await requireFarm();
  return (
    <div className="space-y-5">
      <Summary
        title="Reports"
        description="Download each register as CSV, Excel, or PDF. The same role rules as the screen apply."
        facts={[{ label: "Registers", value: String(reports.length) }]}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(([kind, label, detail]) => (
          <li key={kind} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="font-medium">{label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            <p className="mt-4 flex gap-3 text-sm font-medium">
              <Link href={`/reports/${kind}`} className="text-primary">
                CSV
              </Link>
              <Link href={`/reports/${kind}?format=xlsx`} className="text-primary">
                Excel
              </Link>
              <Link href={`/reports/${kind}?format=pdf`} className="text-primary">
                PDF
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
