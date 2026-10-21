import Link from "next/link";
import { Bell, Leaf, LogOut, ScanLine } from "lucide-react";
import { signOut } from "@/lib/auth";
import { FarmDrawer } from "@/components/farm-drawer";
import { FarmNav } from "@/components/farm-nav";
import { HerdSearch } from "@/components/herd-search";
import { PageTransition } from "@/components/page-transition";

export function FarmShell({
  farmName,
  userName,
  role,
  showTeam = false,
  showAudit = false,
  children,
}: {
  farmName: string;
  userName: string;
  role: string;
  showTeam?: boolean;
  showAudit?: boolean;
  children: React.ReactNode;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function SignOutButton() {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-muted-foreground hover:bg-muted" type="submit">
          <LogOut className="size-4" />
          Sign out
        </button>
      </form>
    );
  }

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col self-start overflow-hidden border-r border-border bg-card md:flex">
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{farmName}</p>
            <p className="text-xs text-muted-foreground">Farm portal</p>
          </div>
        </div>
        <FarmNav showTeam={showTeam} showAudit={showAudit} />
        <div className="mt-auto border-t border-border px-3 py-3">
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
          <FarmDrawer farmName={farmName} userName={userName} role={role} initials={initials} showTeam={showTeam} showAudit={showAudit} signOut={<SignOutButton />} />
          <HerdSearch showTeam={showTeam} showAudit={showAudit} />
          <Link href="/scan" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground">
            <ScanLine className="size-4" />
            <span className="sr-only">Scan</span>
          </Link>
          <Link href="/alerts" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground">
            <Bell className="size-4" />
            <span className="sr-only">Alerts</span>
          </Link>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials}</span>
            <div>
              <p className="text-sm font-medium leading-tight">{userName}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
          </div>
        </header>
        <main className="min-w-0 max-w-full overflow-x-clip px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
