import { PageHeader, Panel, Pill } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { roleLabel } from "@/lib/team";

export const metadata = { title: "Profile" };

function initials(name: string) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "•";
}

export default async function ProfilePage() {
  const farm = await requireFarm();
  const name = farm.userName ?? farm.email;
  const roles = farm.roles.map((role) => roleLabel[role] ?? role);

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" description="Your sign-in on this farm." />
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">{initials(name)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{name}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{farm.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((role) => (
                <Pill key={role} tone="good">
                  {role}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </section>
      <Panel title="This farm" description="The farm attached to this sign-in.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Farm</dt>
            <dd className="mt-1 text-sm font-medium">{farm.farmName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Timezone</dt>
            <dd className="mt-1 text-sm font-medium">{farm.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Animal prefix</dt>
            <dd className="mt-1 text-sm font-medium">{farm.animalPrefix}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
