import Link from "next/link";
import { Bell, Leaf, Search } from "lucide-react";
import { signOut } from "@/lib/auth";
import { FarmNav } from "@/components/farm-nav";
import { PageTransition } from "@/components/page-transition";

export function FarmShell({
  farmName,
  userName,
  role,
  showTeam = false,
  children,
}: {
  farmName: string;
  userName: string;
  role: string;
  showTeam?: boolean;
  children: React.ReactNode;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-border bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col md:self-start md:overflow-hidden md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{farmName}</p>
            <p className="text-xs text-muted-foreground">Farm portal</p>
          </div>
        </div>
        <FarmNav showTeam={showTeam} />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
          className="mt-auto hidden px-3 py-4 md:block"
        >
          <button className="h-10 w-full rounded-xl px-3 text-left text-sm text-muted-foreground hover:bg-muted" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur">
          <form action="/animals" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-muted px-4 md:mx-auto md:max-w-xl">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              name="q"
              placeholder="Search cattle by ID, name, or breed"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </form>
          <Link href="/alerts" className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground">
            <Bell className="size-4" />
            <span className="sr-only">Alerts</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials}
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-medium leading-tight">{userName}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
          </div>
        </header>
        <main className="px-4 py-5 md:px-6 md:py-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
