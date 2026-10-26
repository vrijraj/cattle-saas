import Link from "next/link";
import { Bell, Eye, Leaf, LogOut, PanelLeft, ScanLine, Sparkles } from "lucide-react";
import { signOut } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import { FarmDrawer } from "@/components/farm-drawer";
import { FarmNav } from "@/components/farm-nav";
import { HerdSearch } from "@/components/herd-search";
import { PageTransition, ScreenTransition } from "@/components/page-transition";

export function FarmShell({
  farmName,
  userName,
  role,
  showTeam = false,
  showAudit = false,
  showFinance = false,
  showReports = false,
  showGenetics = false,
  showHealth = false,
  showSemen = false,
  farmId,
  children,
}: {
  farmName: string;
  userName: string;
  role: string;
  showTeam?: boolean;
  showAudit?: boolean;
  showFinance?: boolean;
  showReports?: boolean;
  showGenetics?: boolean;
  showHealth?: boolean;
  showSemen?: boolean;
  farmId: string;
  children: React.ReactNode;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function SignOutButton({ menu = false }: { menu?: boolean }) {
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
              : "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          }
          type="submit"
          role={menu ? "menuitem" : undefined}
        >
          <LogOut className="size-3.5 shrink-0" />
          {menu ? "Log out" : "Sign out"}
        </button>
      </form>
    );
  }

  return (
    <ScreenTransition>
      <div className="min-h-screen bg-[#141518] text-foreground md:grid md:grid-cols-[244px_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col self-start overflow-hidden bg-[#141518] text-zinc-100 md:flex">
          <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-white text-[#141518]">
                <Leaf className="size-3.5" />
              </span>
              <span className="text-sm font-semibold tracking-tight text-white">CattleOS</span>
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25">
                Pro
              </span>
            </Link>
            <Link
              href="/dashboard"
              title="Dashboard overview"
              className="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <PanelLeft className="size-4" />
            </Link>
          </div>

          <div className="px-2.5 pt-1.5 pb-1">
            <HerdSearch
              variant="sidebar"
              farmId={farmId}
              showTeam={showTeam}
              showAudit={showAudit}
              showFinance={showFinance}
              showReports={showReports}
              showGenetics={showGenetics}
              showHealth={showHealth}
              showSemen={showSemen}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col pt-1">
            <FarmNav showTeam={showTeam} showAudit={showAudit} showHealth={showHealth} showSemen={showSemen} showGenetics={showGenetics} />
          </div>

          <div className="mt-auto border-t border-white/[0.07] px-2.5 py-2.5">
            <SignOutButton />
          </div>
        </aside>

        <div className="min-w-0 bg-[#f3f4f6] md:my-2 md:mr-2 md:flex md:min-h-[calc(100vh-1rem)] md:flex-col md:overflow-x-clip md:rounded-[24px] md:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-[#f3f4f6]/90 px-3 py-2.5 backdrop-blur-md sm:px-6 md:rounded-t-[24px]">
            <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
              <FarmDrawer
                farmName={farmName}
                userName={userName}
                role={role}
                initials={initials}
                showTeam={showTeam}
                showAudit={showAudit}
                showHealth={showHealth}
                showSemen={showSemen}
                showGenetics={showGenetics}
                signOut={<SignOutButton />}
              />
              <HerdSearch
                variant="header"
                farmId={farmId}
                showTeam={showTeam}
                showAudit={showAudit}
                showFinance={showFinance}
                showReports={showReports}
                showGenetics={showGenetics}
                showHealth={showHealth}
                showSemen={showSemen}
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/scan"
                title="Scan animal QR or semen straw"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
              >
                <ScanLine className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Scan QR</span>
              </Link>
              <Link
                href="/shop"
                title="Public shop preview"
                className="hidden h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-medium text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary sm:inline-flex"
              >
                <Eye className="size-3.5 text-muted-foreground" />
                <span>Shop</span>
              </Link>
              <Link
                href="/alerts"
                title="View alerts & scheduled reminders"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/20"
              >
                <span className="size-2 rounded-full bg-emerald-600" />
                <span>Live</span>
                <Bell className="ml-0.5 size-3.5" />
              </Link>
              <Link
                href="/ai"
                title="AI Assistant"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 transition hover:bg-indigo-500/15"
              >
                <Sparkles className="size-3.5" />
                <span className="sr-only">AI Assistant</span>
              </Link>
              <AccountMenu userName={userName} role={role} initials={initials} logout={<SignOutButton menu />} />
            </div>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-[1220px] flex-1 overflow-x-clip px-4 pt-2 pb-8 sm:px-7 md:px-9">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </ScreenTransition>
  );
}
