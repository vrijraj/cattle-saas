import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { PrintButton } from "@/app/(farm)/animals/[code]/label/print-button";
import { requireFarm } from "@/lib/farm-context";

export const metadata = { title: "Bulk Printable QR Labels" };

export default async function BulkLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ shed?: string; layout?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const shedFilter = query.shed?.trim() ?? "";
  const compact = query.layout === "compact";

  const [sheds, rows] = await Promise.all([
    db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.farmId, farm.farmId)).orderBy(asc(locations.name)),
    db
      .select({
        id: animals.id,
        code: animals.code,
        name: animals.name,
        earTag: animals.earTag,
        rfid: animals.rfid,
        locationId: animals.locationId,
        breedName: breeds.name,
        locationName: locations.name,
      })
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .leftJoin(locations, eq(locations.id, animals.locationId))
      .where(
        and(
          eq(animals.farmId, farm.farmId),
          eq(animals.presence, "on_farm"),
          ...(shedFilter ? [eq(animals.locationId, shedFilter)] : []),
        ),
      )
      .orderBy(asc(animals.code)),
  ]);

  return (
    <div className="space-y-5 print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/animals"
            className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-medium hover:bg-muted"
          >
            ← Cattle register
          </Link>
          <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
            <select name="shed" defaultValue={shedFilter} className="h-9 rounded-full border border-border bg-background px-3">
              <option value="">All sheds ({rows.length})</option>
              {sheds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="layout" defaultValue={compact ? "compact" : "a4"} className="h-9 rounded-full border border-border bg-background px-3">
              <option value="a4">A4 standard (2 columns)</option>
              <option value="compact">Compact thermal (3 columns)</option>
            </select>
            <button type="submit" className="h-9 rounded-full bg-foreground px-3.5 font-medium text-background">
              Apply
            </button>
          </form>
        </div>
        <PrintButton />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No on-farm animals match this shed filter.
        </p>
      ) : (
        <div
          className={`grid gap-3 print:gap-2 ${
            compact ? "grid-cols-2 sm:grid-cols-3 print:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 print:grid-cols-2"
          }`}
        >
          {rows.map((animal) => (
            <article
              key={animal.id}
              className="flex break-inside-avoid items-center gap-3 rounded-2xl border border-foreground/20 bg-white p-3.5 print:rounded-xl print:border-black/60 print:p-2.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/animals/${encodeURIComponent(animal.code)}/qr`}
                alt={`QR ${animal.code}`}
                className={compact ? "size-20 shrink-0" : "size-24 shrink-0"}
              />
              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                <p className="truncate text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{farm.farmName}</p>
                <p className="truncate font-mono text-sm font-bold">{animal.code}</p>
                {animal.name ? <p className="truncate font-medium">{animal.name}</p> : null}
                <p className="truncate text-[11px] text-muted-foreground">
                  {animal.breedName}
                  {animal.locationName ? ` · ${animal.locationName}` : ""}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Tag: <span className="font-medium text-foreground">{animal.earTag ?? "—"}</span>
                  {animal.rfid ? ` · RFID ${animal.rfid}` : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
