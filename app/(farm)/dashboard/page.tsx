import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Bell, Droplets, Heart, Milk } from "lucide-react";
import { db } from "@/db";
import { alerts, animals, breeds } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { herdCounts } from "@/lib/herd-stats";

const breedColors = ["#1f9d57", "#7dce78", "#f0b429", "#3d8bfd", "#8b6cc4", "#94a3a0"];

export default async function DashboardPage() {
  const farm = await requireFarm();
  const today = farmToday(farm.timezone);
  const rows = await db
    .select({ animal: animals, breedName: breeds.name })
    .from(animals)
    .innerJoin(breeds, eq(breeds.id, animals.breedId))
    .where(eq(animals.farmId, farm.farmId));
  const herd = rows.map((row) => row.animal);
  const damIds = new Set(herd.map((animal) => animal.geneticDamId).filter((id): id is string => Boolean(id)));
  const counts = herdCounts(
    herd.map((animal) => ({
      id: animal.id,
      presence: animal.presence,
      lactation: animal.lactation,
      reproduction: animal.reproduction,
      dob: animal.dob,
      isDam: damIds.has(animal.id),
    })),
    today,
  );

  const openAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")));

  const breedTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.animal.presence !== "on_farm") continue;
    breedTotals.set(row.breedName, (breedTotals.get(row.breedName) ?? 0) + 1);
  }
  const breedsOnFarm = [...breedTotals.entries()].sort((a, b) => b[1] - a[1]);
  const breedSum = breedsOnFarm.reduce((sum, [, count]) => sum + count, 0) || 1;
  let cursor = 0;
  const donut = breedsOnFarm
    .map(([name, count], index) => {
      const start = (cursor / breedSum) * 100;
      cursor += count;
      const end = (cursor / breedSum) * 100;
      return `${breedColors[index % breedColors.length]} ${start}% ${end}%`;
    })
    .join(", ");

  const upcoming = herd
    .filter((animal) => animal.presence === "on_farm" && animal.reproduction === "pregnant")
    .sort((a, b) => (a.expectedCalving ?? "9999").localeCompare(b.expectedCalving ?? "9999"));

  const stats = [
    { label: "Total cattle", value: counts.total, icon: Heart, hint: "On the farm" },
    { label: "Lactating", value: counts.lactating, icon: Milk, hint: "In milk today" },
    { label: "Pregnant", value: counts.pregnant, icon: Droplets, hint: "Confirmed pregnancies" },
    { label: "Open alerts", value: openAlerts.length, icon: Bell, hint: "Still due" },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[#e7f6ee] px-5 py-6 md:px-8 md:py-7">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary">WELCOME BACK</p>
          <h1 className="mt-2 max-w-md text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Manage a healthier herd
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {farm.farmName}. Cattle, milk, breeding, and what is due — {formatDisplayDate(today)}.
          </p>
        </div>
        <FarmMark />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:p-4">
            <div className="flex items-start justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary sm:size-10">
                <stat.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-xs text-primary">{stat.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Cattle overview</h2>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div
              className="grid size-36 place-items-center rounded-full"
              style={{ background: breedSum ? `conic-gradient(${donut})` : "#e6ece8" }}
            >
              <div className="grid size-24 place-items-center rounded-full bg-card text-center">
                <span>
                  <span className="block text-2xl font-semibold">{counts.total}</span>
                  <span className="text-xs text-muted-foreground">Total</span>
                </span>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {breedsOnFarm.map(([name, count], index) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: breedColors[index % breedColors.length] }} />
                  <span className="text-muted-foreground">{name}</span>
                  <span className="ml-auto font-medium">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Upcoming calvings</h2>
            <Link href="/breeding" className="text-sm text-primary">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {upcoming.length === 0 ? <li className="py-4 text-sm text-muted-foreground">No pregnant animals with a due date.</li> : null}
            {upcoming.slice(0, 5).map((animal) => (
              <li key={animal.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/animals/${animal.code}`} className="font-medium">
                    {animal.name ?? animal.code}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {animal.code}
                    {animal.expectedCalving ? ` · Expected ${formatDisplayDate(animal.expectedCalving)}` : " · Date not calculated"}
                  </p>
                </div>
                <DueBadge today={today} due={animal.expectedCalving} />
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Open alerts</h2>
            <Link href="/alerts" className="text-sm text-primary">
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {openAlerts.length === 0 ? <li className="text-sm text-muted-foreground">Nothing is due.</li> : null}
            {openAlerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Bell className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">{alert.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}

function DueBadge({ today, due }: { today: string; due: string | null }) {
  if (!due) return <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">No date</span>;
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const soon = days <= 30;
  const label = days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `In ${days} days`;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${soon || days < 0 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function FarmMark() {
  return (
    <svg viewBox="0 0 420 180" className="pointer-events-none absolute right-0 bottom-0 hidden h-full w-[46%] md:block" aria-hidden="true">
      <path d="M0 140 C80 110 120 150 200 120 C280 90 320 150 420 100 L420 180 L0 180 Z" fill="#b7e4c7" />
      <path d="M40 140 C90 90 130 120 170 80 C210 40 250 90 300 60 C340 40 370 80 420 50 L420 180 L0 180 Z" fill="#95d5b2" />
      <rect x="230" y="78" width="90" height="48" rx="6" fill="#d8f3dc" />
      <path d="M222 82 L275 48 L328 82 Z" fill="#1f9d57" />
      <rect x="258" y="98" width="18" height="28" fill="#1f9d57" />
      <circle cx="150" cy="96" r="18" fill="#2d6a4f" />
      <circle cx="360" cy="70" r="22" fill="#40916c" />
    </svg>
  );
}
