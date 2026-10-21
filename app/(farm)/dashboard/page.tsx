import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import { Beef, Bell, Droplets, Milk, Sun, Wheat } from "lucide-react";
import { db } from "@/db";
import { alerts, animals, breeds, feedItems, feedMovements, locations, milkYields } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { herdCounts } from "@/lib/herd-stats";
import { lactationLabel, reproductionLabel } from "@/lib/labels";
import { canReadAlert } from "@/lib/permissions";

const breedColors = ["#157347", "#7dce78", "#e0a106", "#3d8bfd", "#8b6cc4", "#94a3a0"];

export const metadata = { title: "Dashboard" };

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

  const openAlerts = (
    await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open")))
  ).filter((alert) => canReadAlert(farm.roles, alert.type));

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
  const shedRows = await db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.farmId, farm.farmId));
  const shedName = new Map(shedRows.map((row) => [row.id, row.name]));
  const [feed, feedMoves] = await Promise.all([
    db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)),
  ]);
  const lowFeed = feed
    .map((item) => {
      const balance = feedBalance(feedMoves.filter((movement) => movement.itemId === item.id));
      return { item, balance, low: feedIsLow(balance, item.minimumQuantity) };
    })
    .filter((row) => row.low)
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
  const onFarm = herd.filter((animal) => animal.presence === "on_farm");
  const lactationBars = countLabels(onFarm.map((animal) => lactationLabel[animal.lactation]));
  const reproductionBars = countLabels(onFarm.map((animal) => reproductionLabel[animal.reproduction]));
  const shedBars = countLabels(onFarm.map((animal) => (animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned")));
  const milkStart = addDays(today, -6);
  const milkRows = await db
    .select({
      recordedOn: milkYields.recordedOn,
      morningLitres: milkYields.morningLitres,
      eveningLitres: milkYields.eveningLitres,
      voidedAt: milkYields.voidedAt,
    })
    .from(milkYields)
    .where(and(eq(milkYields.farmId, farm.farmId), gte(milkYields.recordedOn, milkStart)));
  const milkByDay = new Map<string, number>();
  for (let offset = 0; offset < 7; offset += 1) milkByDay.set(addDays(milkStart, offset), 0);
  for (const row of milkRows) {
    if (row.voidedAt || !milkByDay.has(row.recordedOn)) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    milkByDay.set(row.recordedOn, (milkByDay.get(row.recordedOn) ?? 0) + litres);
  }
  const milkDays = [...milkByDay.entries()];
  const milkToday = milkDays.find(([day]) => day === today)?.[1] ?? 0;
  const isolated = herd
    .filter((animal) => animal.presence === "on_farm" && animal.isolationReason)
    .map((animal) => ({
      ...animal,
      shed: animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned",
      days: animal.isolatedOn ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${animal.isolatedOn}T00:00:00Z`)) / 86400000)) : null,
    }));

  const stats = [
    { label: "On farm", value: String(counts.total), icon: Beef, hint: "Animals present" },
    { label: "Lactating", value: String(counts.lactating), icon: Milk, hint: "In milk today" },
    { label: "Dry", value: String(counts.dry), icon: Sun, hint: "Between lactations" },
    { label: "Pregnant", value: String(counts.pregnant), icon: Droplets, hint: "Confirmed pregnancies" },
    { label: "Milk today", value: `${milkToday.toFixed(1)} L`, icon: Milk, hint: formatDisplayDate(today) },
    { label: "Open alerts", value: String(openAlerts.length), icon: Bell, hint: "Still due" },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[#e7f6ee] px-5 py-6 md:px-8 md:py-7">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary">WELCOME BACK</p>
          <h1 className="mt-2 max-w-md text-3xl text-foreground sm:text-4xl">
            Cattle Management System
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {farm.farmName}. Cattle, milk, breeding, and what is due on {formatDisplayDate(today)}.
          </p>
        </div>
        <FarmMark />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
            <div className="flex items-start justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary sm:size-10">
                <stat.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 font-display text-2xl tracking-tight sm:text-3xl">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-xs text-primary">{stat.hint}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Milk, last 7 days</h2>
            <Link href="/milk" className="text-sm text-primary">
              Milk register
            </Link>
          </div>
          <MilkLine days={milkDays} />
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Cattle overview</h2>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div
              className="grid size-36 place-items-center rounded-full"
              style={{ background: breedSum ? `conic-gradient(${donut})` : "#e6ece8" }}
            >
              <div className="grid size-24 place-items-center rounded-full bg-card text-center">
                <span>
                  <span className="block font-display text-2xl">{counts.total}</span>
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

        <article className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Lactation</h2>
          <BarList rows={lactationBars} />
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Reproduction</h2>
          <BarList rows={reproductionBars} />
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sheds</h2>
            <Link href="/locations" className="text-sm text-primary">
              View all
            </Link>
          </div>
          <BarList rows={shedBars} />
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Isolated</h2>
          <ul className="mt-4 divide-y divide-border">
            {isolated.length === 0 ? <li className="py-4 text-sm text-muted-foreground">No animal is isolated.</li> : null}
            {isolated.map((animal) => (
              <li key={animal.id} className="py-3">
                <Link href={`/animals/${animal.code}`} className="font-medium">
                  {animal.name ?? animal.code}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {animal.code} · {animal.isolationReason}
                  {animal.days !== null ? ` · ${animal.days} days` : ""} · {animal.shed}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
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

        <article className="rounded-2xl border border-border bg-card p-5">
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

        <article className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Feed stock</h2>
            <Link href="/feed" className="text-sm text-primary">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {lowFeed.length === 0 ? <li className="py-4 text-sm text-muted-foreground">Stock is above the minimum set for each item.</li> : null}
            {lowFeed.map(({ item, balance }) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Wheat className="size-3.5" />
                </span>
                <div>
                  <Link href="/feed" className="text-sm font-medium">
                    {item.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {balance.toFixed(1)} {item.unit} on hand · minimum {item.minimumQuantity} {item.unit}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}

function MilkLine({ days }: { days: [string, number][] }) {
  const width = 640;
  const height = 148;
  const top = 16;
  const bottom = 8;
  const max = Math.max(...days.map(([, litres]) => litres), 1);
  const last = Math.max(days.length - 1, 1);
  const points = days.map(([, litres], index) => ({
    x: (index / last) * width,
    y: top + (1 - litres / max) * (height - top - bottom),
    litres,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${points.at(-1)?.x.toFixed(1) ?? 0} ${height - bottom} L ${points[0]?.x.toFixed(1) ?? 0} ${height - bottom} Z`;
  return (
    <div className="mt-4">
      <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMid meet"
        style={{ aspectRatio: `${width} / ${height}` }}
        className="block w-full overflow-visible"
        role="img"
        aria-label="Milk litres for the last 7 days"
      >
        <path d={area} fill="#157347" opacity="0.12" />
        <path d={line} fill="none" stroke="#157347" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => (
          <circle key={days[index][0]} cx={point.x} cy={point.y} r="4.5" fill="#ffffff" stroke="#157347" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {points.map((point, index) => {
        const atStart = index === 0;
        const atEnd = index === days.length - 1;
        return (
          <button
            key={days[index][0]}
            type="button"
            className="group absolute z-10 size-8 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
            aria-label={`${formatDisplayDate(days[index][0])}, ${point.litres.toFixed(1)} litres`}
          >
            <span
              className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs group-hover:block group-focus-visible:block ${atStart ? "left-0" : atEnd ? "right-0" : "left-1/2 -translate-x-1/2"}`}
            >
              <span className="block font-medium whitespace-nowrap">{formatDisplayDate(days[index][0])}</span>
              <span className="text-muted-foreground">{point.litres.toFixed(1)} L</span>
            </span>
          </button>
        );
      })}
      </div>
      <div className="relative mt-2 h-8">
        {days.map(([day, litres], index) => {
          const atStart = index === 0;
          const atEnd = index === days.length - 1;
          return (
            <span
              key={day}
              className={`absolute top-0 w-14 text-[10px] text-muted-foreground ${atStart ? "left-0 text-left" : atEnd ? "right-0 text-right" : "left-0 -translate-x-1/2 text-center"}`}
              style={atStart || atEnd ? undefined : { left: `${(index / last) * 100}%` }}
            >
              {formatDisplayDate(day).replace(/ \d{4}$/, "")}
              <span className="mt-0.5 block font-medium text-foreground">{litres.toFixed(1)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function countLabels(labels: string[]) {
  const totals = new Map<string, number>();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  return [...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function BarList({ rows }: { rows: [string, number][] }) {
  const max = Math.max(...rows.map(([, count]) => count), 1);
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ul className="mt-4 space-y-3">
      {rows.map(([label, count]) => (
        <li key={label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{label}</span>
            <span className="font-medium">{count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.round((count / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
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
    <svg viewBox="0 0 420 180" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute right-0 bottom-0 hidden h-full w-[46%] md:block" aria-hidden="true">
      <g transform="translate(48 0)">
        <path d="M0 140 C80 110 120 150 200 120 C280 90 320 150 420 100 L420 180 L0 180 Z" fill="#b7e4c7" />
        <path d="M40 140 C90 90 130 120 170 80 C210 40 250 90 300 60 C340 40 370 80 420 50 L420 180 L0 180 Z" fill="#95d5b2" />
        <rect x="230" y="78" width="90" height="48" rx="6" fill="#d8f3dc" />
        <path d="M222 82 L275 48 L328 82 Z" fill="#157347" />
        <rect x="258" y="98" width="18" height="28" fill="#157347" />
        <circle cx="150" cy="96" r="18" fill="#2d6a4f" />
        <circle cx="360" cy="70" r="22" fill="#40916c" />
      </g>
    </svg>
  );
}
