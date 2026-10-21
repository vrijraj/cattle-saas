import type { Metadata } from "next";
import { FarmShell } from "@/components/farm-shell";
import { requireFarm } from "@/lib/farm-context";
import { canManageTeam, canViewAudit, canViewFinance, canViewGenetics, canViewHealth, canViewReports, canViewSemen } from "@/lib/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const farm = await requireFarm();
  return {
    title: {
      default: farm.farmName,
      template: `%s · ${farm.farmName}`,
    },
    description: `Cattle, milk, breeding, and health records for ${farm.farmName}.`,
  };
}

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
      showFinance={canViewFinance(farm.roles)}
      showReports={canViewReports(farm.roles)}
      showGenetics={canViewGenetics(farm.roles)}
      showHealth={canViewHealth(farm.roles)}
      showSemen={canViewSemen(farm.roles)}
      farmId={farm.farmId}
    >
      {children}
    </FarmShell>
  );
}
