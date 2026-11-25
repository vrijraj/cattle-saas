import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import {
  ArrowRight,
  ArrowUpRight,
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
  Plus,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
  Wheat,
} from "lucide-react";
import { db } from "@/db";
import { alerts, animals, breeds, feedItems, feedMovements, financeEntries, inseminations, locations, milkYields } from "@/db/schema";
import { requireFarm } from "@/lib/farm-context";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedIsLow } from "@/lib/feed-stock";
import { herdCounts } from "@/lib/herd-stats";
import { t } from "@/lib/i18n";
import {
  canReadAlert,
  canSeeClinical,
  canViewFinance,
  canViewGenetics,
  canViewHealth,
  canViewReports,
  canViewSemen,
  canWriteAnimals,
} from "@/lib/permissions";

const breedColors = ["#157347", "#7dce78", "#e0a106", "#3d8bfd", "#8b6cc4", "#94a3a0"];

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const farm = await requireFarm();
  const today = farmToday(farm.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const milkStart = addDays(today, -6);
  const queryStart = milkStart < monthStart ? milkStart : monthStart;
  const showClinical = canSeeClinical(farm.roles);
  const showLowFeed = canReadAlert(farm.roles, "low_feed");
  const showFinance = canViewFinance(farm.roles);

  const [rows, alertRows, shedRows, feed, feedMoves, milkRows, aiMonthRows, financeMonthRows] = await Promise.all([
    db
      .select({ animal: animals, breedName: breeds.name })
      .from(animals)
      .innerJoin(breeds, eq(breeds.id, animals.breedId))
      .where(eq(animals.farmId, farm.farmId)),
    db
      .select()
      .from(alerts)
      .where(and(eq(alerts.farmId, farm.farmId), eq(alerts.status, "open"))),
    db.select({ id: locations.id, name: locations.name, active: locations.active }).from(locations).where(eq(locations.farmId, farm.farmId)),
    showLowFeed ? db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)) : Promise.resolve([]),
    showLowFeed ? db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)) : Promise.resolve([]),
    db
      .select({
        animalId: milkYields.animalId,
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
    showFinance
      ? db
          .select({
            kind: financeEntries.kind,
            amount: financeEntries.amount,
            entryOn: financeEntries.entryOn,
            voidedAt: financeEntries.voidedAt,
          })
          .from(financeEntries)
          .where(and(eq(financeEntries.farmId, farm.farmId), gte(financeEntries.entryOn, monthStart)))
      : Promise.resolve([]),
  ]);

  const herd = rows.map((row) => row.animal);
  const byId = new Map(herd.map((animal) => [animal.id, animal]));
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
  const onFarm = herd.filter((animal) => animal.presence === "on_farm");
  const cattleCount = onFarm.filter((animal) => animal.species === "cattle").length;
  const buffaloCount = onFarm.filter((animal) => animal.species === "buffalo").length;

  const openAlerts = alertRows
    .filter((alert) => canReadAlert(farm.roles, alert.type))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const healthAlertTypes = new Set(["vaccine_due", "deworming_due", "deworm_due", "health_followup", "medication_due", "withdrawal"]);
  const healthAlerts = openAlerts.filter((alert) => healthAlertTypes.has(alert.type));
  const healthDueNow = healthAlerts.filter((alert) => !alert.dueOn || alert.dueOn <= today);

  const breedTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.animal.presence !== "on_farm") continue;
    breedTotals.set(row.breedName, (breedTotals.get(row.breedName) ?? 0) + 1);
  }
  const breedsOnFarm = [...breedTotals.entries()].sort((a, b) => b[1] - a[1]);

  const upcoming = onFarm
    .filter((animal) => animal.reproduction === "pregnant")
    .sort((a, b) => (a.expectedCalving ?? "9999").localeCompare(b.expectedCalving ?? "9999"));
  const thirtyDaysAhead = addDays(today, 30);
  const calvingSoonCount = upcoming.filter((animal) => animal.expectedCalving && animal.expectedCalving <= thirtyDaysAhead).length;

  const activeShedCount = shedRows.filter((row) => row.active).length;
  const shedName = new Map(shedRows.map((row) => [row.id, row.name]));
  const lowFeed = showLowFeed
    ? feed
        .map((item) => {
          const balance = feedBalance(feedMoves.filter((movement) => movement.itemId === item.id));
          return { item, balance, low: feedIsLow(balance, item.minimumQuantity) };
        })
        .filter((row) => row.low)
        .sort((left, right) => left.item.name.localeCompare(right.item.name))
    : [];
  const shedBars = countLabels(onFarm.map((animal) => (animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned")));

  const milkByDay = new Map<string, number>();
  for (let offset = 0; offset < 7; offset += 1) milkByDay.set(addDays(milkStart, offset), 0);
  let milkMonth = 0;
  const lactatingIds = new Set(onFarm.filter((animal) => animal.lactation === "lactating").map((animal) => animal.id));
  const enteredTodayIds = new Set<string>();
  for (const row of milkRows) {
    if (row.voidedAt) continue;
    const litres = Number(row.morningLitres ?? 0) + Number(row.eveningLitres ?? 0);
    if (milkByDay.has(row.recordedOn)) {
      milkByDay.set(row.recordedOn, (milkByDay.get(row.recordedOn) ?? 0) + litres);
    }
    if (row.recordedOn === today && lactatingIds.has(row.animalId)) {
      enteredTodayIds.add(row.animalId);
    }
    if (row.recordedOn >= monthStart && row.recordedOn <= today) {
      milkMonth += litres;
    }
  }
  const notEnteredToday = Math.max(0, lactatingIds.size - enteredTodayIds.size);
  const aiThisMonth = aiMonthRows.filter((row) => !row.voidedAt && row.performedOn <= today).length;
  const milkDays = [...milkByDay.entries()];
  const milkToday = milkDays.find(([day]) => day === today)?.[1] ?? 0;

  const isolated = onFarm
    .filter((animal) => Boolean(animal.isolationReason))
    .map((animal) => ({
      ...animal,
      shed: animal.locationId ? (shedName.get(animal.locationId) ?? "Unassigned") : "Unassigned",
      days: animal.isolatedOn ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${animal.isolatedOn}T00:00:00Z`)) / 86400000)) : null,
    }));

  const mtdIncome = financeMonthRows
    .filter((row) => !row.voidedAt && row.entryOn <= today && row.kind === "income")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const mtdExpense = financeMonthRows
    .filter((row) => !row.voidedAt && row.entryOn <= today && row.kind === "expense")
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const totalOpenWithFeed = openAlerts.length + lowFeed.length;
  const healthyRatio = counts.total > 0 ? Math.round(((counts.total - isolated.length) / counts.total) * 100) : 100;
  const mtdNet = mtdIncome - mtdExpense;
  const mtdMargin = mtdIncome > 0 ? Math.round((mtdNet / mtdIncome) * 100) : null;

  const topKpis = [
    {
      label: t(farm.locale, "dash.kpi.herd"),
      value: String(counts.total),
      badge: `${cattleCount}C · ${buffaloCount}B`,
      badgeClass: "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/15",
      icon: Beef,
      iconClass: "bg-blue-500/10 text-blue-700",
      hint: `${counts.lactating} lactating · ${counts.dry} dry · ${counts.calves} calves`,
      href: "/animals?view=active",
    },
    {
      label: t(farm.locale, "dash.kpi.milk"),
      value: `${milkToday.toFixed(1)} L`,
      badge: `${enteredTodayIds.size}/${lactatingIds.size} logged`,
      badgeClass: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15",
      icon: Milk,
      iconClass: "bg-emerald-500/10 text-emerald-700",
      hint: notEnteredToday > 0 ? `${notEnteredToday} lactating pending · MTD ${milkMonth.toFixed(1)} L` : `All lactating logged · MTD ${milkMonth.toFixed(1)} L`,
      href: "/milk",
    },
    {
      label: t(farm.locale, "dash.kpi.pregnant"),
      value: String(counts.pregnant),
      badge: `${calvingSoonCount} in 30d`,
      badgeClass: "bg-amber-500/12 text-amber-800 ring-1 ring-inset ring-amber-500/20",
      icon: HeartPulse,
      iconClass: "bg-amber-500/12 text-amber-700",
      hint: `${calvingSoonCount} calving soon · ${aiThisMonth} AI this month`,
      href: "/breeding",
    },
    {
      label: t(farm.locale, "dash.kpi.alerts"),
      value: String(totalOpenWithFeed),
      badge: totalOpenWithFeed === 0 ? "All clear" : `${healthDueNow.length} due now`,
      badgeClass:
        totalOpenWithFeed === 0
          ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15"
          : "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/15",
      icon: Bell,
      iconClass: totalOpenWithFeed === 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700",
      hint: `${healthDueNow.length} health due now${showLowFeed && lowFeed.length > 0 ? ` · ${lowFeed.length} low feed` : ""}`,
      href: "/alerts",
    },
  ];

  const quickActions = [
    { label: "Cattle", href: "/animals", icon: Beef, show: true },
    { label: "Milk sheet", href: "/milk", icon: Milk, show: true },
    { label: "Breeding & AI", href: "/breeding", icon: HeartPulse, show: true },
    { label: "Health & vet", href: "/health", icon: Stethoscope, show: canViewHealth(farm.roles) },
    { label: "Semen stock", href: "/semen", icon: Droplets, show: canViewSemen(farm.roles) },
    { label: "Genetics", href: "/genetics", icon: Dna, show: canViewGenetics(farm.roles) },
    { label: "Feed & ration", href: "/feed", icon: Wheat, show: true },
    { label: "Sheds", href: "/locations", icon: Warehouse, show: true },
    { label: "Scan QR", href: "/scan", icon: ScanLine, show: true },
    { label: "Finance", href: "/finance", icon: Wallet, show: showFinance },
    { label: "Reports", href: "/reports", icon: FileBarChart, show: canViewReports(farm.roles) },
  ].filter((item) => item.show);

  const readinessChecks = [
    { label: `${counts.lactating} Lactating animals in milk`, href: "/milk" },
    { label: `${counts.pregnant} Confirmed pregnant cattle`, href: "/breeding" },
    { label: `${counts.dry} Dry animals between lactations`, href: "/animals?view=active&lactation=dry" },
    { label: `${counts.calves} Calves & young stock on farm`, href: "/animals?view=calves" },
    { label: `${aiThisMonth} Inseminations recorded this month`, href: "/breeding" },
    ...(showLowFeed
      ? [{ label: lowFeed.length === 0 ? "All feed rations above minimum stock" : `${lowFeed.length} feed item(s) below minimum`, href: "/feed" }]
      : []),
  ];

  const cardClass = "rounded-2xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

  return (
    <div className="page-enter space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{t(farm.locale, "dash.title")}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              {t(farm.locale, "dash.activeHerd")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
              <MapPin className="size-3.5 text-primary" />
              {t(farm.locale, "dash.onFarm")} · {farm.farmName}
            </span>
            <span className="text-border">•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5 text-muted-foreground/80" />
              {formatDisplayDate(today)}
            </span>
            <span className="text-border">•</span>
            <span>
              {counts.total} animals across {activeShedCount} active {activeShedCount === 1 ? "shed" : "sheds"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/animals"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-primary/35 hover:text-primary"
          >
            <Beef className="size-3.5 text-muted-foreground" />
            {t(farm.locale, "animals.title")}
          </Link>
          <Link
            href="/milk"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 text-xs font-semibold text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-primary/35 hover:text-primary"
          >
            <Milk className="size-3.5 text-muted-foreground" />
            {t(farm.locale, "dash.milkSheet")}
          </Link>
          {canWriteAnimals(farm.roles) ? (
            <Link
              href="/animals/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-[0_1px_2px_rgba(21,115,71,0.28)] transition hover:bg-primary/90"
            >
              <Plus className="size-3.5" />
              {t(farm.locale, "dash.addCattle")}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {topKpis.map((stat) => {
          const StatIcon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="group flex flex-col justify-between rounded-2xl border border-black/[0.06] bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_20px_-10px_rgba(15,23,42,0.12)] sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{stat.label}</p>
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${stat.iconClass}`}>
                  <StatIcon className="size-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <p className="font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-[28px]">{stat.value}</p>
                <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold tabular-nums ${stat.badgeClass}`}>
                  {stat.badge}
                </span>
              </div>
              <p className="mt-2.5 truncate text-xs text-muted-foreground">{stat.hint}</p>
            </Link>
          );
        })}
      </section>

      {showFinance ? (
        <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-card shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-secondary text-primary">
                <Wallet className="size-3.5" />
              </span>
              <span className="text-xs font-semibold text-foreground">Month-to-date cashflow</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">· Since {formatDisplayDate(monthStart)}</span>
            </div>
            <Link href="/finance" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Open ledger
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Link href="/finance" className="group px-5 py-4 transition hover:bg-[#f8faf9]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t(farm.locale, "dash.monthIncome")}</p>
                <TrendingUp className="size-3.5 text-emerald-600" />
              </div>
              <p className="mt-1.5 font-display text-xl font-semibold tracking-tight tabular-nums text-emerald-700">
                ₹{Math.round(mtdIncome).toLocaleString("en-IN")}
              </p>
            </Link>
            <Link href="/finance" className="group px-5 py-4 transition hover:bg-[#f8faf9]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t(farm.locale, "dash.monthExpense")}</p>
                <TrendingDown className="size-3.5 text-muted-foreground" />
              </div>
              <p className="mt-1.5 font-display text-xl font-semibold tracking-tight tabular-nums text-foreground">
                ₹{Math.round(mtdExpense).toLocaleString("en-IN")}
              </p>
            </Link>
            <Link href="/finance" className="group px-5 py-4 transition hover:bg-[#f8faf9]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{t(farm.locale, "dash.monthNet")}</p>
                {mtdMargin !== null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                      mtdMargin >= 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
                    }`}
                  >
                    {mtdMargin >= 0 ? "+" : ""}
                    {mtdMargin}% margin
                  </span>
                ) : null}
              </div>
              <p className={`mt-1.5 font-display text-xl font-semibold tracking-tight tabular-nums ${mtdNet >= 0 ? "text-emerald-700" : "text-danger"}`}>
                {mtdNet < 0 ? "−" : ""}₹{Math.round(Math.abs(mtdNet)).toLocaleString("en-IN")}
              </p>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-12">
        <article className={`${cardClass} xl:col-span-8`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Milk &amp; reproduction snapshot</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Live 7-day production curve and breeding activity for {farm.farmName}.</p>
            </div>
            {canViewReports(farm.roles) ? (
              <Link href="/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Reports
                <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="grid gap-2.5 lg:col-span-5">
              <div className="rounded-xl border border-black/[0.04] bg-[#f6f7f9] p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Monthly milk</p>
                <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground">{milkMonth.toFixed(1)} L</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Since {formatDisplayDate(monthStart)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-black/[0.04] bg-[#f6f7f9] p-3.5">
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Today</p>
                  <p className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-foreground">{milkToday.toFixed(1)} L</p>
                </div>
                <div className="rounded-xl border border-black/[0.04] bg-[#f6f7f9] p-3.5">
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">AI (MTD)</p>
                  <p className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-foreground">{aiThisMonth}</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-black/[0.04] bg-[#fafbfc] p-3.5 lg:col-span-7">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Milk, last 7 days</p>
                <span className="text-[11px] font-medium text-muted-foreground">Litres / day</span>
              </div>
              <MilkLine days={milkDays} />
            </div>
          </div>
        </article>

        <article className={`${cardClass} flex flex-col xl:col-span-4`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Pending tasks &amp; alerts</h2>
              {openAlerts.length > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/12 px-1.5 text-[11px] font-semibold tabular-nums text-amber-800">
                  {openAlerts.length}
                </span>
              ) : null}
            </div>
            <Link href="/alerts" className="text-xs font-semibold text-primary hover:underline">
              {openAlerts.length === 0 ? "All done" : "View all"}
            </Link>
          </div>
          {openAlerts.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-emerald-500/15 bg-secondary/50 px-4 py-7 text-center">
              <span className="grid size-9 place-items-center rounded-full bg-white text-primary shadow-2xs">
                <CheckCircle2 className="size-4.5" />
              </span>
              <p className="mt-2.5 text-xs font-semibold text-foreground">You&apos;re all set</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Nothing is due on {formatDisplayDate(today)}.</p>
            </div>
          ) : (
            <ul className="mt-3.5 space-y-2">
              {openAlerts.slice(0, 4).map((alert) => {
                const animal = alert.animalId ? byId.get(alert.animalId) : undefined;
                const href = animal ? `/animals/${animal.code}` : "/alerts";
                return (
                  <li key={alert.id}>
                    <Link
                      href={href}
                      className="flex items-start gap-2.5 rounded-xl border border-black/[0.04] bg-[#f6f7f9] p-3 transition hover:border-primary/25 hover:bg-secondary/45"
                    >
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-white text-primary shadow-2xs">
                        <Bell className="size-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{alert.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {alert.dueOn ? `Due ${formatDisplayDate(alert.dueOn)} · ` : ""}
                          {alert.body}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
            <span className="text-[11px] text-muted-foreground">{quickActions.length} shortcuts</span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {quickActions.slice(0, 10).map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex h-10 items-center gap-2 rounded-xl border border-black/[0.05] bg-[#f6f7f9] px-2.5 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:bg-secondary/65 hover:text-primary"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white text-primary shadow-2xs transition group-hover:bg-primary group-hover:text-white">
                  <action.icon className="size-3.5" />
                </span>
                <span className="truncate">{action.label}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Herd readiness</h2>
            </div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-secondary-foreground">
              {healthyRatio}% healthy
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500" style={{ width: `${healthyRatio}%` }} />
          </div>
          <ul className="mt-4 space-y-2.5">
            {readinessChecks.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 -mx-1.5 text-xs text-foreground/90 transition hover:bg-[#f6f7f9] hover:text-primary"
                >
                  <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Warehouse className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Sheds &amp; cattle mix</h2>
            </div>
            <Link href="/locations" className="text-xs font-semibold text-primary hover:underline">
              Manage
            </Link>
          </div>
          <RatioList rows={shedBars} total={Math.max(counts.total, 1)} />
          <div className="mt-4 border-t border-border/70 pt-3.5">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Breeds on farm</p>
            <ul className="mt-2.5 space-y-1.5 text-xs">
              {breedsOnFarm.map(([name, count], index) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: breedColors[index % breedColors.length] }} />
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="ml-auto font-semibold tabular-nums text-foreground">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Upcoming calvings</h2>
            </div>
            <Link href="/breeding" className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {upcoming.length === 0 ? (
              <li className="rounded-xl bg-[#f6f7f9] px-3.5 py-4 text-center text-xs text-muted-foreground">
                No pregnant animals with a due date.
              </li>
            ) : null}
            {upcoming.slice(0, 5).map((animal) => (
              <li key={animal.id} className="py-1 first:pt-0">
                <Link
                  href={`/animals/${animal.code}`}
                  className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 -mx-2 transition hover:bg-[#f6f7f9]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{animal.name ?? animal.code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {animal.code}
                      {animal.expectedCalving ? ` · Expected ${formatDisplayDate(animal.expectedCalving)}` : " · Date not calculated"}
                    </p>
                  </div>
                  <DueBadge today={today} due={animal.expectedCalving} />
                </Link>
              </li>
            ))}
          </ul>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Stethoscope className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Health &amp; vaccination</h2>
            </div>
            {canViewHealth(farm.roles) ? (
              <Link href="/health" className="text-xs font-semibold text-primary hover:underline">
                View all
              </Link>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2">
            {healthAlerts.length === 0 ? (
              <li className="rounded-xl bg-[#f6f7f9] px-3.5 py-4 text-center text-xs text-muted-foreground">
                No vaccinations or health follow-ups due.
              </li>
            ) : null}
            {healthAlerts.slice(0, 5).map((alert) => {
              const animal = alert.animalId ? byId.get(alert.animalId) : undefined;
              const href = animal ? `/animals/${animal.code}?tab=health` : "/alerts";
              return (
                <li key={alert.id}>
                  <Link href={href} className="flex gap-2.5 rounded-xl p-1.5 -mx-1.5 transition hover:bg-[#f6f7f9]">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                      <HeartPulse className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{alert.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {alert.dueOn ? `Due ${formatDisplayDate(alert.dueOn)} · ` : ""}
                        {alert.body}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </article>

        <article className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wheat className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{showLowFeed ? "Feed stock & isolation" : "Isolation status"}</h2>
            </div>
            <Link href={showLowFeed ? "/feed" : "/locations"} className="text-xs font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {lowFeed.length === 0 && isolated.length === 0 ? (
              <li className="rounded-xl bg-[#f6f7f9] px-3.5 py-4 text-center text-xs text-muted-foreground">
                {showLowFeed ? "All feed items above minimum and no cattle isolated." : "No cattle currently isolated."}
              </li>
            ) : null}
            {lowFeed.map(({ item, balance }) => (
              <li key={item.id} className="flex items-start gap-2.5 py-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Wheat className="size-3.5" />
                </span>
                <div>
                  <Link href="/feed" className="text-xs font-semibold text-foreground hover:text-primary">
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
                  {animal.code}
                  {showClinical && animal.isolationReason ? ` · ${animal.isolationReason}` : ""}
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
    <div className="mt-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMid meet"
          style={{ aspectRatio: `${width} / ${height}` }}
          className="block w-full overflow-visible"
          role="img"
          aria-label="Milk litres for the last 7 days"
        >
          <defs>
            <linearGradient id="milk-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#157347" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#157347" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = top + (1 - ratio) * (height - top - bottom);
            return (
              <line
                key={ratio}
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 4"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <path d={area} fill="url(#milk-area-grad)" />
          <path d={line} fill="none" stroke="#157347" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => (
            <circle key={days[index][0]} cx={point.x} cy={point.y} r="4.5" fill="#ffffff" stroke="#157347" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
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
                className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs shadow-sm group-hover:block group-focus-visible:block ${atStart ? "left-0" : atEnd ? "right-0" : "left-1/2 -translate-x-1/2"}`}
              >
                <span className="block font-medium whitespace-nowrap">{formatDisplayDate(days[index][0])}</span>
                <span className="text-muted-foreground">{point.litres.toFixed(1)} L</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {days.map(([day, litres]) => (
          <span key={day} className="truncate">
            <span className="block truncate">{formatDisplayDate(day).replace(/ \d{4}$/, "")}</span>
            <span className="mt-0.5 block font-medium tabular-nums text-foreground">{litres.toFixed(1)}</span>
          </span>
        ))}
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
