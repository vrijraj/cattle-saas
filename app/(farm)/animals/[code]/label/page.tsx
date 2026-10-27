import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { animals, breeds, locations } from "@/db/schema";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { sexLabel } from "@/lib/labels";
import { PrintButton } from "./print-button";

export const metadata = { title: "Printable QR Label" };

export default async function AnimalLabelPage({ params }: { params: Promise<{ code: string }> }) {
  const farm = await requireFarm();
  const { code } = await params;
  const [row] = await db
    .select({
      animal: animals,
      breedName: breeds.name,
      locationName: locations.name,
    })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .leftJoin(locations, eq(locations.id, animals.locationId))
    .where(and(eq(animals.farmId, farm.farmId), eq(animals.code, code)))
    .limit(1);

  if (!row) notFound();
  const { animal, breedName, locationName } = row;

  return (
    <div className="printable-label-sheet mx-auto max-w-xl space-y-5 print:max-w-md print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/animals/${animal.code}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          ← Back to {animal.name ?? animal.code}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/animals/${animal.code}/qr?download=1`}
            download={`${animal.code}-qr.png`}
            className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium transition hover:bg-muted"
          >
            Download QR PNG
          </a>
          <PrintButton />
        </div>
      </div>

      <section className="printable-label-card rounded-3xl border-2 border-foreground/20 bg-white p-6 text-foreground shadow-xs print:rounded-2xl print:border-2 print:border-black print:p-6 print:shadow-none">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start print:flex-row print:items-start">
          <div className="shrink-0 rounded-2xl border border-border bg-white p-3 print:border-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/animals/${animal.code}/qr`} alt={`QR code for ${animal.code}`} className="size-40 sm:size-44 print:size-36" />
          </div>
          <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left print:text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground print:text-black/70">{farm.farmName}</p>
              <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl print:text-2xl">{animal.code}</h1>
              {animal.name ? <p className="mt-0.5 text-lg font-medium">{animal.name}</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-left text-sm print:border-black/25">
              <div>
                <dt className="text-xs text-muted-foreground print:text-black/60">Breed</dt>
                <dd className="font-medium">{breedName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground print:text-black/60">Sex</dt>
                <dd className="font-medium">{sexLabel[animal.sex]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground print:text-black/60">Ear tag</dt>
                <dd className="font-medium">{animal.earTag ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground print:text-black/60">Date of birth</dt>
                <dd className="font-medium">
                  {animal.dob ? `${formatDisplayDate(animal.dob)}${animal.dobEstimated ? " (est.)" : ""}` : "Unknown"}
                </dd>
              </div>
              {locationName ? (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground print:text-black/60">Shed / Location</dt>
                  <dd className="font-medium">{locationName}</dd>
                </div>
              ) : null}
            </dl>
            <p className="pt-1 text-xs text-muted-foreground print:text-black/65">
              Scan QR with phone camera or field scanner to open animal profile.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
