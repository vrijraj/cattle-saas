import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { FarmShell } from "@/components/farm-shell";
import { requireFarm } from "@/lib/farm-context";
import {
  canManageSettings,
  canManageTeam,
  canPublish,
  canReadAlert,
  canViewAudit,
  canViewEnquiries,
  canViewFinance,
  canViewGenetics,
  canViewHealth,
  canViewReports,
  canViewSemen,
  canViewShopAdmin,
} from "@/lib/permissions";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

function roleLabel(roles: string[]) {
  if (roles.length === 0) return "Member";
  return roles
    .map((role) => role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" · ");
}

export default async function FarmLayout({ children }: { children: React.ReactNode }) {
  const farm = await requireFarm();
  const openAlerts = await db
    .select({ type: alerts.type })
    .from(alerts)
    .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")));
  const openAlertCount = openAlerts.filter((item) => canReadAlert(farm.roles, item.type)).length;

  return (
    <FarmShell
      farmName={farm.farmName}
      farmSlug={farm.farmSlug}
      userName={farm.userName ?? farm.email}
      role={roleLabel(farm.roles)}
      userId={farm.userId}
      farmId={farm.farmId}
      locale={farm.locale}
      farms={farm.farms}
      openAlertCount={openAlertCount}
      showTeam={canManageTeam(farm.roles)}
      showAudit={canViewAudit(farm.roles)}
      showFinance={canViewFinance(farm.roles)}
      showReports={canViewReports(farm.roles)}
      showGenetics={canViewGenetics(farm.roles)}
      showHealth={canViewHealth(farm.roles)}
      showSemen={canViewSemen(farm.roles)}
      showShop={canViewShopAdmin(farm.roles)}
      showListings={canPublish(farm.roles)}
      showEnquiries={canViewEnquiries(farm.roles)}
      showSettings={canManageSettings(farm.roles)}
      showAdmin={farm.isSuperAdmin}
    >
      {children}
    </FarmShell>
  );
}
