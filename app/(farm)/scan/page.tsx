import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { animals, bulls, semenBatches, straws } from "@/db/schema";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canRecordBreeding } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { CodeScanner } from "@/components/code-scanner";
import { Summary } from "@/components/workspace";
import { recordAi } from "../herd/actions";

function tokenFrom(value: string) {
  const match = value.match(/\/q\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const raw = query.code?.trim() ?? "";
  let strawCard: {
    code: string;
    status: string;
    tank: string | null;
    canister: string | null;
    goblet: string | null;
    position: string | null;
    bullCode: string;
    bullName: string;
    batchNumber: string;
    semenType: string;
  } | null = null;
  let missing = false;

  if (raw) {
    const token = tokenFrom(raw);
    const [animal] = await db
      .select({ code: animals.code })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), token ? eq(animals.qrToken, token) : eq(animals.code, raw)))
      .limit(1);
    if (animal) redirect(`/animals/${animal.code}`);

    const [straw] = await db
      .select({
        code: straws.code,
        status: straws.status,
        tank: straws.tank,
        canister: straws.canister,
        goblet: straws.goblet,
        position: straws.position,
        bullCode: bulls.code,
        bullName: bulls.name,
        batchNumber: semenBatches.batchNumber,
        semenType: semenBatches.semenType,
      })
      .from(straws)
      .innerJoin(semenBatches, eq(semenBatches.id, straws.batchId))
      .innerJoin(bulls, eq(bulls.id, semenBatches.bullId))
      .where(and(eq(straws.farmId, farm.farmId), eq(straws.code, raw)))
      .limit(1);
    if (straw) strawCard = straw;
    else missing = true;
  }

  const females = strawCard
    ? await db
        .select({ id: animals.id, code: animals.code, name: animals.name })
        .from(animals)
        .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm"), eq(animals.sex, "female")))
        .orderBy(animals.code)
    : [];

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <Summary title="Scan" description="Open an animal from a tag, or look up a straw and start an insemination." />
      <CodeScanner />
      {missing ? <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">No animal or straw matches {raw}.</p> : null}
      {strawCard ? (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground">Straw {strawCard.code}</p>
            <h2 className="text-lg font-semibold">
              {strawCard.bullName} · {strawCard.bullCode}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Batch {strawCard.batchNumber} · {strawCard.semenType} · {strawCard.status}
            </p>
            <p className="text-sm text-muted-foreground">
              {[strawCard.tank, strawCard.canister, strawCard.goblet, strawCard.position].filter(Boolean).join(" · ") || "Location not recorded"}
            </p>
          </div>
          {strawCard.status === "available" && canRecordBreeding(farm.roles) ? (
            <form action={recordAi} className="grid gap-3">
              <input type="hidden" name="bullCode" value={strawCard.bullCode} />
              <input type="hidden" name="bullName" value={strawCard.bullName} />
              <input type="hidden" name="batchNumber" value={strawCard.batchNumber} />
              <input type="hidden" name="strawCode" value={strawCard.code} />
              <input type="hidden" name="performedOn" value={farmToday(farm.timezone)} />
              <FormSelect
                name="animalId"
                required
                placeholder="Cow"
                options={females.map((animal) => ({ value: animal.id, label: `${animal.code}${animal.name ? ` · ${animal.name}` : ""}` }))}
              />
              <button className="h-11 rounded-full bg-primary text-sm font-medium text-primary-foreground" type="submit">
                Use in AI
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">This straw is {strawCard.status}, so it cannot start a new insemination.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
