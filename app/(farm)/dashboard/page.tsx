import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import {
  Beef,
  Bell,
  Calendar,
  CheckCircle2,
  Dna,
  Droplets,
  FileBarChart,
  HeartPulse,
  MapPin,
  Milk,
  ScanLine,
  Stethoscope,
  Warehouse,
  Wheat,
} from "lucide-react";
import { db } from "@/db";
import { alerts, animals, breeds, feedItems, feedMovements, inseminations, locations, milkYields } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { herdCounts } from "@/lib/herd-stats";
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
  )
    .filter((alert) => canReadAlert(farm.roles, alert.type))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const healthAlertTypes = new Set(["vaccine_due", "deworming_due", "deworm_due", "health_followup", "medication_due", "withdrawal"]);
  const healthAlerts = openAlerts.filter((alert) => healthAlertTypes.has(alert.type));

  const breedTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.animal.presence !== "on_farm") continue;
    breedTotals.set(row.breedName, (breedTotals.get(row.breedName) ?? 0) + 1);
  }
  const breedsOnFarm = [...breedTotals.entries()].sort((a, b) => b[1] - a[1]);

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
  const shedBars = countLabels(onFarm.map((animal) => (animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned")));
  const milkStart = addDays(today, -6);
  const monthStart = `${today.slice(0, 8)}01`;
  const queryStart = milkStart < monthStart ? milkStart : monthStart;
  const [milkRows, aiMonthRows] = await Promise.all([
    db
      .select({
        recordedOn: milkYields.recordedOn,
        morningLitres: milkYields.morningLitres,
        eveningLitres: milkYields.eveningLitres,
        voidedAt: milkYields.voidedAt,
      })
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farm.farmId), gte(milkYields.recordedOn, queryStart))),
    db
      .select({
        id: inseminations.id,
        performedOn: inseminations.performedOn,
        voidedAt: inseminations.voidedAt,
      })
      .from(inseminations)
      .where(and(eq(inseminations.farmId, farm.farmId), gte(inseminations.performedOn, monthStart))),
  ]);
  const milkByDay = new Map<string, number>();
  for (let offset = 0; offset < 7; offset += 1) milkByDay.set(addDays(milkStart, offset), 0);
  let milkMonth = 0;
  for (const row of milkRows) {
    if (row.voidedAt) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    if (milkByDay.has(row.recordedOn)) {
      milkByDay.set(row.recordedOn, (milkByDay.get(row.recordedOn) ?? 0) + litres);
    }
    if (row.recordedOn >= monthStart && row.recordedOn <= today) {
      milkMonth += litres;
    }
  }
  const aiThisMonth = aiMonthRows.filter((row) => !row.voidedAt && row.performedOn <= today).length;
  const milkDays = [...milkByDay.entries()];
  const milkToday = milkDays.find(([day]) => day === today)?.[1] ?? 0;
  const isolated = herd
    .filter((animal) => animal.presence === "on_farm" && animal.isolationReason)
    .map((animal) => ({
      ...animal,
      shed: animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned",
      days: animal.isolatedOn ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${animal.isolatedOn}T00:00:00Z`)) / 86400000)) : null,
    }));

  const topKpis = [
    {
      label: "CATTLE ON FARM",
      value: String(counts.total),
      badge: String(counts.total),
      badgeClass: "bg-blue-500/12 text-blue-700",
      hint: `${counts.lactating} lactating · ${counts.dry} dry · ${counts.calves} calves`,
      href: "/animals?view=active",
    },
    {
      label: "TODAY'S MILK",
      value: `${milkToday.toFixed(1)} L`,
      badge: String(counts.lactating),
      badgeClass: "bg-emerald-500/12 text-emerald-700",
      hint: `Monthly total: ${milkMonth.toFixed(1)} L`,
      href: "/milk",
    },
    {
      label: "PREGNANT & AI",
      value: String(counts.pregnant),
      badge: String(aiThisMonth),
      badgeClass: "bg-amber-500/14 text-amber-700",
      hint: `${aiThisMonth} AI recorded this month`,
      href: "/breeding",
    },
    {
      label: "OPEN ALERTS",
      value: String(openAlerts.length),
      badge: String(healthAlerts.length),
      badgeClass: "bg-rose-500/12 text-rose-700",
      hint: `${healthAlerts.length} health / vaccine due`,
      href: "/alerts",
    },
  ];

  const quickActions = [
    { label: "Cattle", href: "/animals", icon: Beef },
    { label: "Milk sheet", href: "/milk", icon: Milk },
    { label: "Breeding & AI", href: "/breeding", icon: HeartPulse },
    { label: "Health & vet", href: "/health", icon: Stethoscope },
    { label: "Semen stock", href: "/semen", icon: Droplets },
    { label: "Genetics", href: "/genetics", icon: Dna },
    { label: "Feed & ration", href: "/feed", icon: Wheat },
    { label: "Sheds", href: "/locations", icon: Warehouse },
    { label: "Scan QR", href: "/scan", icon: ScanLine },
    { label: "Reports", href: "/reports", icon: FileBarChart },
  ];

  const readinessChecks = [
    { label: `${counts.lactating} Lactating animals in milk`, href: "/milk" },
    { label: `${counts.pregnant} Confirmed pregnant cattle`, href: "/breeding" },
    { label: `${counts.dry} Dry animals between lactations`, href: "/animals" },
    { label: `${counts.calves} Calves & young stock on farm`, href: "/animals?view=calves" },
    { label: `${aiThisMonth} Inseminations recorded this month`, href: "/breeding" },
    { label: lowFeed.length === 0 ? "All feed rations above minimum stock" : `${lowFeed.length} feed item(s) below minimum`, href: "/feed" },
  ];

  const cardClass = "rounded-2xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-4 pt-1 pb-2 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Overview</h1>
            <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/20">
              Active herd
            </span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5 text-muted-foreground/80" />
              {formatDisplayDate(today)}
            </span>
            <span>·</span>
            <span>{farm.timezone}</span>
            <span>·</span>
            <span>Since {formatDisplayDate(monthStart)}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <MapPin className="size-3.5 text-primary" />
              On farm
            </span>
            <span>·</span>
            <span>{farm.farmName}</span>
            <span>·</span>
            <span>{counts.total} cattle across {shedRows.length} sheds</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/animals"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
          >
            <Beef className="size-3.5 text-muted-foreground" />
            Cattle
          </Link>
          <Link
            href="/milk"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/35 hover:text-primary"
          >
            <Milk className="size-3.5 text-muted-foreground" />
            Milk sheet
          </Link>
          <Link
            href="/animals/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            + Add cattle
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {topKpis.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-2xl border border-black/[0.06] bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-primary/30 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:p-5"
          >
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{stat.label}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">{stat.value}</p>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${stat.badgeClass}`}>
                {stat.badge}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">{stat.hint}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-3.5 lg:grid-cols-3">
        <article className={cardClass}>
          <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex h-10 items-center gap-2 rounded-xl bg-secondary/75 px-3 text-xs font-semibold text-primary transition hover:bg-secondary"
              >
                <action.icon className="size-3.5 shrink-0" />
                <span className="truncate">{action.label}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Pending tasks & alerts</h2>
            <Link href="/alerts" className="text-xs font-semibold text-primary hover:underline">
              {openAlerts.length === 0 ? "All done" : "View all"}
            </Link>
          </div>
          {openAlerts.length === 0 ? (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-secondary/65 p-3.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-semibold text-foreground">You&apos;re all set</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Nothing is due on {formatDisplayDate(today)}.</p>
              </div>
            </div>
          ) : (
            <ul className="mt-3.5 space-y-2.5">
              {openAlerts.slice(0, 4).map((alert) => (
                <li key={alert.id} className="flex items-start gap-2.5 rounded-xl bg-[#f6f7f9] p-3">
                  <Bell className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{alert.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {alert.dueOn ? `Due ${formatDisplayDate(alert.dueOn)} · ` : ""}
                      {alert.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Herd readiness</h2>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{counts.total} head</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${counts.total > 0 ? Math.min(100, Math.max(18, Math.round(((counts.lactating + counts.pregnant + counts.calves) / counts.total) * 100))) : 100}%` }}
            />
          </div>
          <ul className="mt-4 space-y-2.5">
            {readinessChecks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="flex items-center gap-2.5 text-xs text-foreground/90 transition hover:text-primary">
                  <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-3">
        <article className={`${cardClass} xl:col-span-2`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Milk & reproduction snapshot</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Live production and breeding counts for {farm.farmName}.</p>
            </div>
            <Link href="/reports" className="text-xs font-semibold text-primary hover:underline">
              Analytics
            </Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="grid gap-2.5 lg:col-span-5">
              <div className="rounded-xl bg-[#f6f7f9] p-3.5">
                <p className="text-xs text-muted-foreground">Monthly milk</p>
                <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">{milkMonth.toFixed(1)} L</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Since {formatDisplayDate(monthStart)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[#f6f7f9] p-3.5">
                  <p className="text-xs text-muted-foreground">Milk today</p>
                  <p className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums">{milkToday.toFixed(1)} L</p>
                </div>
                <div className="rounded-xl bg-[#f6f7f9] p-3.5">
                  <p className="text-xs text-muted-foreground">AI this month</p>
                  <p className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums">{aiThisMonth}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-7">
              <p className="text-xs font-medium text-muted-foreground">Milk, last 7 days</p>
              <MilkLine days={milkDays} />
            </div>
          </div>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Sheds & cattle mix</h2>
            <Link href="/locations" className="text-xs font-semibold text-primary hover:underline">
              Manage
            </Link>
          </div>
          <RatioList rows={shedBars} total={Math.max(counts.total, 1)} />
          <div className="mt-4 border-t border-border/70 pt-3.5">
            <p className="text-xs font-semibold text-muted-foreground">Breeds on farm</p>
            <ul className="mt-2.5 space-y-1.5 text-xs">
              {breedsOnFarm.map(([name, count], index) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: breedColors[index % breedColors.length] }} />
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="ml-auto font-semibold tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="grid gap-3.5 lg:grid-cols-3">
        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Upcoming calvings</h2>
            <Link href="/breeding" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {upcoming.length === 0 ? <li className="py-4 text-xs text-muted-foreground">No pregnant animals with a due date.</li> : null}
            {upcoming.slice(0, 5).map((animal) => (
              <li key={animal.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/animals/${animal.code}`} className="text-xs font-semibold text-foreground hover:text-primary">
                    {animal.name ?? animal.code}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {animal.code}
                    {animal.expectedCalving ? ` · Expected ${formatDisplayDate(animal.expectedCalving)}` : " · Date not calculated"}
                  </p>
                </div>
                <DueBadge today={today} due={animal.expectedCalving} />
              </li>
            ))}
          </ul>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Health & vaccination alerts</h2>
            <Link href="/health" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 space-y-2.5">
            {healthAlerts.length === 0 ? <li className="py-2 text-xs text-muted-foreground">No vaccinations or health follow-ups due.</li> : null}
            {healthAlerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className="flex gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <HeartPulse className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{alert.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {alert.dueOn ? `Due ${formatDisplayDate(alert.dueOn)} · ` : ""}
                    {alert.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Feed stock & isolation</h2>
            <Link href="/feed" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {lowFeed.length === 0 && isolated.length === 0 ? (
              <li className="py-4 text-xs text-muted-foreground">All feed items above minimum and no cattle isolated.</li>
            ) : null}
            {lowFeed.map(({ item, balance }) => (
              <li key={item.id} className="flex items-start gap-2.5 py-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Wheat className="size-3.5" />
                </span>
                <div>
                  <Link href="/feed" className="text-xs font-semibold hover:text-primary">
                    {item.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {balance.toFixed(1)} {item.unit} on hand · min {item.minimumQuantity} {item.unit}
                  </p>
                </div>
              </li>
            ))}
            {isolated.map((animal) => (
              <li key={animal.id} className="py-2.5">
                <Link href={`/animals/${animal.code}`} className="text-xs font-semibold text-foreground hover:text-primary">
                  {animal.name ?? animal.code} (Isolated)
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {animal.code} · {animal.isolationReason}
                  {animal.days !== null ? ` · ${animal.days} days` : ""} · {animal.shed}
                </p>
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

function RatioList({ rows, total }: { rows: [string, number][]; total: number }) {
  if (rows.length === 0) return <p className="mt-4 text-xs text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ul className="mt-3.5 space-y-3">
      {rows.slice(0, 4).map(([label, count]) => (
        <li key={label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-foreground">{label}</span>
            <span className="font-medium tabular-nums text-muted-foreground">
              {count} / {total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.round((count / total) * 100))}%` }} />
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
