import { PageHeader, Panel } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { roleLabel } from "@/lib/team";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const farm = await requireFarm();
  const roles = farm.roles.map((role) => roleLabel[role] ?? role).join(", ");

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader title="Profile" description={farm.farmName} />
      <Panel>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="mt-1 font-medium">{farm.userName ?? farm.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="mt-1 font-medium">{farm.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="mt-1 font-medium">{roles}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Farm</dt>
            <dd className="mt-1 font-medium">{farm.farmName}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
