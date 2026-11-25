import { asc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { aiSessions, animals, farmMembers, farms } from "@/db/schema";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { updateTenantFarm } from "./actions";

export const metadata = { title: "Platform admin" };

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await requireFarm();
  if (!actor.isSuperAdmin) redirect("/dashboard");
  const query = await searchParams;

  const [allFarms, animalCounts, memberCounts, aiCounts] = await Promise.all([
    db.select().from(farms).orderBy(asc(farms.createdAt)),
    db.select({ farmId: animals.farmId, total: count() }).from(animals).groupBy(animals.farmId),
    db.select({ farmId: farmMembers.farmId, total: count() }).from(farmMembers).groupBy(farmMembers.farmId),
    db.select({ farmId: aiSessions.farmId, total: count() }).from(aiSessions).groupBy(aiSessions.farmId),
  ]);

  const animalMap = new Map(animalCounts.map((r) => [r.farmId, Number(r.total)]));
  const memberMap = new Map(memberCounts.map((r) => [r.farmId, Number(r.total)]));
  const aiMap = new Map(aiCounts.map((r) => [r.farmId, Number(r.total)]));

  const totalAnimals = [...animalMap.values()].reduce((s, n) => s + n, 0);
  const totalMembers = [...memberMap.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-5">
      <Summary
        title="Platform administration"
        description="Super-admin console across all tenant dairy farms. Manage subscription tiers, animal & staff quotas, and account status."
        facts={[
          { label: "Tenant farms", value: String(allFarms.length) },
          { label: "Total animals", value: String(totalAnimals) },
          { label: "Total staff seats", value: String(totalMembers) },
        ]}
      />
      {query.saved === "1" ? <Notice>Tenant plan and quota limits updated.</Notice> : null}
      {query.error ? <Notice tone="danger">Check quota limits and status values and try again.</Notice> : null}

      <Table headers={["Farm", "Plan", "Status", "Animals", "Members", "AI sessions", "Public page", ""]}>
        {allFarms.length === 0 ? <EmptyRow cols={8}>No farms provisioned yet.</EmptyRow> : null}
        {allFarms.map((tenant) => {
          const animalsUsed = animalMap.get(tenant.id) ?? 0;
          const membersUsed = memberMap.get(tenant.id) ?? 0;
          const aiUsed = aiMap.get(tenant.id) ?? 0;
          return (
            <tr key={tenant.id}>
              <Td>
                <p className="font-medium">{tenant.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tenant.slug} · prefix {tenant.animalPrefix}
                </p>
              </Td>
              <Td className="capitalize">{tenant.plan}</Td>
              <Td>
                <Pill tone={tenant.subscriptionStatus === "active" ? "good" : tenant.subscriptionStatus === "suspended" ? "warn" : "neutral"}>
                  {tenant.subscriptionStatus}
                </Pill>
              </Td>
              <Td className="tabular-nums">
                {animalsUsed} / {tenant.maxAnimals}
              </Td>
              <Td className="tabular-nums">
                {membersUsed} / {tenant.maxMembers}
              </Td>
              <Td className="tabular-nums">
                {aiUsed} / {tenant.aiMonthlyLimit}
              </Td>
              <Td>
                <Link href={`/farms/${tenant.slug}`} className="text-xs font-medium text-primary hover:underline">
                  /farms/{tenant.slug}
                </Link>
              </Td>
              <Td>
                <RecordDialog quiet title={`Manage ${tenant.name}`} button="Configure">
                  <form action={updateTenantFarm} className="grid gap-3">
                    <input type="hidden" name="farmId" value={tenant.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        Plan
                        <FormSelect
                          name="plan"
                          defaultValue={tenant.plan}
                          options={[
                            { value: "starter", label: "Starter Dairy" },
                            { value: "pro", label: "Commercial Pro" },
                            { value: "enterprise", label: "Enterprise Co-op" },
                          ]}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Subscription status
                        <FormSelect
                          name="subscriptionStatus"
                          defaultValue={tenant.subscriptionStatus}
                          options={[
                            { value: "active", label: "Active" },
                            { value: "trialing", label: "Trialing" },
                            { value: "past_due", label: "Past due" },
                            { value: "suspended", label: "Suspended" },
                          ]}
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        Max animals
                        <input name="maxAnimals" type="number" min={1} max={100000} required defaultValue={tenant.maxAnimals} className={inputClass} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Max members
                        <input name="maxMembers" type="number" min={1} max={5000} required defaultValue={tenant.maxMembers} className={inputClass} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        AI limit / mo
                        <input name="aiMonthlyLimit" type="number" min={0} max={100000} required defaultValue={tenant.aiMonthlyLimit} className={inputClass} />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <Submit>Save tenant</Submit>
                    </div>
                  </form>
                </RecordDialog>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
