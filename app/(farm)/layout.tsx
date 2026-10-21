import { FarmShell } from "@/components/farm-shell";
import { requireFarm } from "@/lib/farm-context";
import { canManageTeam, canViewAudit } from "@/lib/permissions";

function roleLabel(roles: string[]) {
  const role = roles[0] ?? "member";
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function FarmLayout({ children }: { children: React.ReactNode }) {
  const farm = await requireFarm();
  return (
    <FarmShell
      farmName={farm.farmName}
      userName={farm.userName ?? farm.email}
      role={roleLabel(farm.roles)}
      showTeam={canManageTeam(farm.roles)}
      showAudit={canViewAudit(farm.roles)}
    >
      {children}
    </FarmShell>
  );
}
