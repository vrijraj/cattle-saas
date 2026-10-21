import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, calvings, heats, inseminations, pregnancyChecks } from "@/db/schema";
import { breedingRegister } from "@/lib/breeding-register";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canViewGenetics } from "@/lib/permissions";
import { PanelTabs } from "@/components/panel-tabs";
import { EmptyRow, Notice, pickTab, Summary, Table, Td } from "@/components/workspace";

const errors: Record<string, string> = {
  role: "Your role cannot record this breeding event.",
  animal: "Choose a female on this farm.",
};

const tabs = [
  { id: "due", label: "Due" },
  { id: "pregnant", label: "Pregnant" },
  { id: "heat", label: "Heat" },
  { id: "inseminations", label: "Inseminations" },
  { id: "checks", label: "Checks" },
  { id: "calvings", label: "Calvings" },
];

export const metadata = { title: "Breeding records" };

export default async function BreedingPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const herd = await db.select().from(animals).where(eq(animals.farmId, farm.farmId));
  const heatRows = await db.select().from(heats).where(eq(heats.farmId, farm.farmId));
  const aiRows = await db.select().from(inseminations).where(eq(inseminations.farmId, farm.farmId));
  const checkRows = await db.select().from(pregnancyChecks).where(eq(pregnancyChecks.farmId, farm.farmId));
  const birthRows = await db.select().from(calvings).where(eq(calvings.farmId, farm.farmId));
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
  const register = breedingRegister(
    { herd, heats: heatRows, inseminations: aiRows, checks: checkRows, calvings: birthRows },
    farmToday(farm.timezone),
  );
  const openGenetics = canViewGenetics(farm.roles);
  const notice = query.error ? errors[query.error] : undefined;
  const tab = pickTab(query.tab, tabs, "due");

  function animalLink(animalId: string) {
    const animal = byId.get(animalId);
    if (!animal) return "—";
    return (
      <Link href={`/animals/${animal.code}?tab=breeding`} className="font-medium text-primary">
        {animal.name ?? animal.code}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{animal.code}</span>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <Summary
        title="Breeding"
        description="Heat, insemination, pregnancy checks, and calving for this farm. Each row opens the animal's breeding record."
        facts={[
          { label: "Pregnant", value: String(register.pregnant.length) },
          { label: "Bred", value: String(register.bred.length) },
          { label: "Due", value: String(register.due.length) },
          { label: "Inseminations", value: String(register.inseminations.length) },
        ]}
      />
      {notice ? <Notice tone="danger">{notice}</Notice> : null}

      <PanelTabs
        initialTab={tab}
        tabs={[
          { id: "due", label: "Due", count: register.due.length },
          { id: "pregnant", label: "Pregnant", count: register.pregnant.length },
          { id: "heat", label: "Heat", count: register.heats.length },
          { id: "inseminations", label: "Inseminations", count: register.inseminations.length },
          { id: "checks", label: "Checks", count: register.checks.length },
          { id: "calvings", label: "Calvings", count: register.calvings.length },
        ]}
        panels={{
          due: (
        <Table headers={["Animal", "Follow-up", "Date"]}>
          {register.due.length === 0 ? <EmptyRow cols={3}>Nothing is due in the next 30 days.</EmptyRow> : null}
          {register.due.map((row) => (
            <tr key={`${row.animalId}-${row.kind}`}>
              <Td>{animalLink(row.animalId)}</Td>
              <Td>{row.kind}</Td>
              <Td>{row.dueOn ? formatDisplayDate(row.dueOn) : "Not calculated"}</Td>
            </tr>
          ))}
        </Table>
          ),
          pregnant: (
        <Table headers={["Animal", "Expected calving"]}>
          {register.pregnant.length === 0 ? <EmptyRow cols={2}>No pregnant animals.</EmptyRow> : null}
          {register.pregnant.map((animal) => {
            const record = byId.get(animal.id);
            return (
              <tr key={animal.id}>
                <Td>{animalLink(animal.id)}</Td>
                <Td>{record?.expectedCalving ? formatDisplayDate(record.expectedCalving) : "Not calculated"}</Td>
              </tr>
            );
          })}
        </Table>
          ),
          heat: (
        <Table headers={["Date", "Animal", "Signs"]}>
          {register.heats.length === 0 ? <EmptyRow cols={3}>No heat recorded.</EmptyRow> : null}
          {register.heats.map((row) => (
            <tr key={row.id}>
              <Td>{formatDisplayDate(row.observedOn)}</Td>
              <Td>{animalLink(row.animalId)}</Td>
              <Td>{row.signs}</Td>
            </tr>
          ))}
        </Table>
          ),
          inseminations: (
        <Table headers={["Date", "Animal", "Bull", "Attempt", "Straw", "Result"]}>
          {register.inseminations.length === 0 ? <EmptyRow cols={6}>No AI recorded yet.</EmptyRow> : null}
          {register.inseminations.map((row) => {
            const bull = row.bullName && row.bullName !== row.bullCode ? `${row.bullName} · ${row.bullCode}` : row.bullCode;
            return (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.performedOn)}</Td>
                <Td>{animalLink(row.animalId)}</Td>
                <Td>
                  {openGenetics ? (
                    <Link href={`/genetics?tab=bulls&sire=${encodeURIComponent(row.bullCode)}`} className="text-primary">
                      {bull}
                    </Link>
                  ) : (
                    bull
                  )}
                </Td>
                <Td>{row.attemptNumber}</Td>
                <Td>
                  {row.strawCode ? (
                    <Link href={`/scan?code=${encodeURIComponent(row.strawCode)}`} className="text-primary">
                      {row.strawCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{resultLabel(row.outcome, row.followUp)}</Td>
              </tr>
            );
          })}
        </Table>
          ),
          checks: (
        <Table headers={["Date", "Animal", "Result"]}>
          {register.checks.length === 0 ? <EmptyRow cols={3}>No pregnancy check recorded.</EmptyRow> : null}
          {register.checks.map((row) => (
            <tr key={row.id}>
              <Td>{formatDisplayDate(row.checkedOn)}</Td>
              <Td>{animalLink(row.animalId)}</Td>
              <Td>{resultLabel(row.result, null)}</Td>
            </tr>
          ))}
        </Table>
          ),
          calvings: (
        <Table headers={["Date", "Dam", "Outcome", "Calf"]}>
          {register.calvings.length === 0 ? <EmptyRow cols={4}>No calving recorded.</EmptyRow> : null}
          {register.calvings.map((row) => {
            const calf = row.calfId ? byId.get(row.calfId) : undefined;
            return (
              <tr key={row.id}>
                <Td>{formatDisplayDate(row.calvedOn)}</Td>
                <Td>{animalLink(row.damId)}</Td>
                <Td>{row.outcome === "live" ? "Live calf" : row.outcome === "dead" ? "Dead calf" : row.outcome}</Td>
                <Td>
                  {calf ? (
                    <Link href={`/animals/${calf.code}`} className="text-primary">
                      {calf.name ?? calf.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
          ),
        }}
      />
    </div>
  );
}

function resultLabel(outcome: string | null, followUp: string | null) {
  if (outcome === "live") return "Live calf";
  if (outcome === "dead") return "Dead calf";
  if (outcome === "pregnant") return "Pregnant";
  if (outcome === "not_pregnant") return "Not pregnant";
  if (outcome === "doubtful") return "Doubtful";
  if (outcome) return outcome;
  if (followUp) return `Pregnancy check due ${formatDisplayDate(followUp)}`;
  return "—";
}
