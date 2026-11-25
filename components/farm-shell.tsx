import Link from "next/link";
import { Bell, Eye, Leaf, LogOut, ScanLine, Settings, Sparkles } from "lucide-react";
import { signOut } from "@/lib/auth";
import { siteConfig } from "@/lib/site-config";
import { AccountMenu } from "@/components/account-menu";
import { FarmDrawer } from "@/components/farm-drawer";
import { FarmNav } from "@/components/farm-nav";
import { HerdSearch } from "@/components/herd-search";
import { OfflineSyncBanner } from "@/components/offline-sync-banner";
import { PageTransition, ScreenTransition } from "@/components/page-transition";
import { t } from "@/lib/i18n";

function SignOutButton({ menu = false, iconOnly = false }: { menu?: boolean; iconOnly?: boolean }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button
        className={
          menu
            ? "flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium hover:bg-muted"
            : iconOnly
              ? "grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              : "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        }
        type="submit"
        title={iconOnly ? "Sign out" : undefined}
        role={menu ? "menuitem" : undefined}
      >
        <LogOut className="size-3.5 shrink-0" />
        {iconOnly ? <span className="sr-only">Sign out</span> : menu ? "Log out" : "Sign out"}
      </button>
    </form>
  );
}

export function FarmShell({
  farmName,
  farmSlug,
  userName,
  role,
  userId,
  farmId,
  locale = "en",
  farms = [],
  openAlertCount = 0,
  showTeam = false,
  showAudit = false,
  showFinance = false,
  showReports = false,
  showGenetics = false,
  showHealth = false,
  showSemen = false,
  showShop = false,
  showListings = false,
  showEnquiries = false,
  showSettings = false,
  showAdmin = false,
  children,
}: {
  farmName: string;
  farmSlug: string;
  userName: string;
  role: string;
  userId: string;
  farmId: string;
  locale?: string;
  farms?: { id: string; name: string; slug: string; roles: string[] }[];
  openAlertCount?: number;
  showTeam?: boolean;
  showAudit?: boolean;
  showFinance?: boolean;
  showReports?: boolean;
  showGenetics?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
  showShop?: boolean;
  showListings?: boolean;
  showEnquiries?: boolean;
  showSettings?: boolean;
  showAdmin?: boolean;
  children: React.ReactNode;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navFlags = {
    showTeam,
    showAudit,
    showFinance,
    showReports,
    showGenetics,
    showHealth,
    showSemen,
    showShop,
    showListings,
    showEnquiries,
    showSettings,
  };

  return (
    <ScreenTransition className="md:h-dvh md:overflow-hidden print:overflow-visible">
      <div className="min-h-dvh bg-[#141518] text-foreground md:grid md:h-dvh md:grid-cols-[252px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden print:block print:h-auto print:min-h-0 print:overflow-visible print:bg-white">
        <aside className="hidden h-full min-h-0 flex-col overflow-hidden bg-[#141518] text-zinc-100 md:flex print:hidden">
          <div className="flex items-center justify-between gap-2 px-3.5 pt-4 pb-2.5">
            <Link href="/dashboard" className="group flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_8px_rgba(16,185,129,0.25)] transition group-hover:from-emerald-400 group-hover:to-emerald-600">
                <Leaf className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold tracking-tight text-white">{siteConfig.name}</span>
                <span className="block truncate text-[11px] text-zinc-400">{farmName}</span>
              </span>
            </Link>
            {showSettings ? (
              <Link
                href="/settings"
                title="Farm settings"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Settings className="size-3.5" />
                <span className="sr-only">Farm settings</span>
              </Link>
            ) : null}
          </div>

          <div className="px-3 pt-1 pb-2">
            <HerdSearch variant="sidebar" farmId={farmId} userId={userId} {...navFlags} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <FarmNav {...navFlags} showAdmin={showAdmin} locale={locale} />
          </div>

          <div className="mt-auto border-t border-white/[0.07] p-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-inset ring-white/[0.06]">
              <Link
                href="/profile"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg transition hover:opacity-90"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
                  {initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-zinc-100">{userName}</span>
                  <span className="block truncate text-[10.5px] text-zinc-400">{role}</span>
                </span>
              </Link>
              <SignOutButton iconOnly />
            </div>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col bg-[#f3f4f6] md:my-2 md:mr-2 md:h-[calc(100dvh-1rem)] md:min-h-0 md:overflow-hidden md:rounded-[24px] md:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] print:m-0 print:block print:h-auto print:min-h-0 print:overflow-visible print:rounded-none print:bg-white print:shadow-none">
          <header
            style={{ viewTransitionName: "farm-header" }}
            className="sticky top-0 z-20 shrink-0 border-b border-black/[0.05] bg-[#f3f4f6]/92 px-4 py-2.5 backdrop-blur-md sm:px-7 md:relative md:top-auto md:px-9 print:hidden"
          >
            <div className="mx-auto flex w-full max-w-[1220px] items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
                <FarmDrawer
                  farmName={farmName}
                  userName={userName}
                  role={role}
                  initials={initials}
                  locale={locale}
                  {...navFlags}
                  showAdmin={showAdmin}
                  signOut={<SignOutButton />}
                />
                <HerdSearch variant="header" farmId={farmId} userId={userId} {...navFlags} />
              </div>

              <div className="hidden min-w-0 items-center gap-2 md:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span className="max-w-[200px] truncate">{farmName}</span>
                </span>
                <span className="hidden truncate text-xs text-muted-foreground lg:inline">{role}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/scan"
                  title="Scan animal QR or semen straw"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-primary/35 hover:text-primary"
                >
                  <ScanLine className="size-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">{t(locale, "action.scanQr")}</span>
                </Link>
                <Link
                  href={`/farms/${farmSlug}`}
                  title="Open public farm catalogue & shop"
                  className="hidden h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-primary/35 hover:text-primary sm:inline-flex"
                >
                  <Eye className="size-3.5 text-muted-foreground" />
                  <span>{t(locale, "action.publicPage")}</span>
                </Link>
                <Link
                  href="/alerts"
                  title="View alerts & scheduled reminders"
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                    openAlertCount > 0
                      ? "border-amber-500/30 bg-amber-500/12 text-amber-900 hover:bg-amber-500/20"
                      : "border-emerald-500/25 bg-emerald-500/12 text-emerald-800 hover:bg-emerald-500/20"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${openAlertCount > 0 ? "bg-amber-600" : "bg-emerald-600"}`} />
                  <span className="tabular-nums">
                    {openAlertCount > 0 ? `${openAlertCount} ${t(locale, "status.openAlerts")}` : t(locale, "status.allClear")}
                  </span>
                  <Bell className="ml-0.5 size-3.5" />
                </Link>
                <Link
                  href="/ai"
                  title="AI Assistant"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-500/15"
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  <span className="hidden xl:inline">AI</span>
                  <span className="sr-only xl:hidden">AI Assistant</span>
                </Link>
                <AccountMenu
                  farmName={farmName}
                  currentFarmId={farmId}
                  locale={locale}
                  farms={farms}
                  userName={userName}
                  role={role}
                  initials={initials}
                  logout={<SignOutButton menu />}
                />
              </div>
            </div>
          </header>

          <div className="farm-scroll flex flex-1 flex-col md:min-h-0 md:overflow-y-auto md:overflow-x-hidden md:overscroll-contain print:block print:overflow-visible">
            <main className="mx-auto flex w-full min-w-0 max-w-[1220px] flex-1 flex-col px-4 pt-4 pb-9 sm:px-7 md:px-9 print:block print:max-w-none print:p-0">
              <OfflineSyncBanner />
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
      </div>
    </ScreenTransition>
  );
}
