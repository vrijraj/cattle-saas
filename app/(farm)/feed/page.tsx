import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { animals, feedItems, feedMovements, locations, milkYields, rationGroupItems, rationGroups } from "@/db/schema";
import { saveFeed, updateFeedItem } from "@/app/(farm)/herd/actions";
import { addDays, farmToday, formatDisplayDate } from "@/lib/dates";
import { feedAverageUnitCost, feedBalance, feedCategoryLabel, feedIsLow, feedKindLabel, feedQuantityLabel, FEED_CATEGORIES, FEED_KINDS } from "@/lib/feed-stock";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFeed, canViewFinance, canVoidRecord } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { EmptyRow, inputClass, Notice, Panel, Pill, Submit, Summary, Table, Td } from "@/components/workspace";
import { addRationItem, applyRationGroup, deleteRationItem, saveRationGroup } from "./actions";

const messages: Record<string, string> = {
  role: "Your role cannot record feed.",
  item: "Choose an item on this farm, or name a new one.",
  quantity: "Enter a valid non-zero quantity (negative values are allowed only for Adjustment).",
  kind: "Choose opening, purchase, consumption, wastage, or adjustment.",
  cost: "Cost per kg must be zero or more.",
  date: "Use a date in YYYY-MM-DD.",
  target: "Choose the herd, a shed on this farm, or an animal on this farm.",
  void: "That feed movement cannot be voided by your role or is outside the 24-hour window.",
};

export const metadata = { title: "Feed and nutrition" };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; voided?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const today = farmToday(farm.timezone);
  const thirtyDaysAgo = addDays(today, -30);

  const [items, movements, sheds, herd, groups, groupItems, recentMilk] = await Promise.all([
    db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)),
    db.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.farmId, farm.farmId), eq(locations.active, true))).orderBy(locations.name),
    db
      .select({ code: animals.code, name: animals.name, lactation: animals.lactation, lifeStage: animals.lifeStage })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm")))
      .orderBy(animals.code),
    db.select().from(rationGroups).where(eq(rationGroups.farmId, farm.farmId)),
    db.select().from(rationGroupItems).where(eq(rationGroupItems.farmId, farm.farmId)),
    db
      .select({ morningLitres: milkYields.morningLitres, eveningLitres: milkYields.eveningLitres })
      .from(milkYields)
      .where(and(eq(milkYields.farmId, farm.farmId), isNull(milkYields.voidedAt), gte(milkYields.recordedOn, thirtyDaysAgo))),
  ]);

  const activeMovements = movements.filter((movement) => !movement.voidedAt);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const avgCostByItem = new Map(
    items.map((item) => [item.id, feedAverageUnitCost(activeMovements.filter((m) => m.itemId === item.id))]),
  );

  // Feed cost per litre (30 days)
  const feedCost30d = activeMovements
    .filter((m) => m.kind === "consumption" && m.movedOn >= thirtyDaysAgo)
    .reduce((sum, m) => {
      const rate = m.unitCost ? Number(m.unitCost) : (avgCostByItem.get(m.itemId) ?? 0);
      return sum + Math.abs(Number(m.quantity)) * (rate || 0);
    }, 0);
  const milkLitres30d = recentMilk.reduce((sum, r) => sum + Number(r.morningLitres ?? 0) + Number(r.eveningLitres ?? 0), 0);
  const feedCostPerLitre = milkLitres30d > 0 && feedCost30d > 0 ? feedCost30d / milkLitres30d : null;

  const balances = items
    .map((item) => {
      const balance = feedBalance(activeMovements.filter((movement) => movement.itemId === item.id));
      return { item, balance, avgCost: avgCostByItem.get(item.id) ?? null, low: feedIsLow(balance, item.minimumQuantity) };
    })
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
  const low = balances.filter((row) => row.low).length;
  const canSave = canRecordFeed(farm.roles);
  const showMoney = canViewFinance(farm.roles);
  const history = [...movements].sort(
    (left, right) => right.movedOn.localeCompare(left.movedOn) || right.createdAt.getTime() - left.createdAt.getTime(),
  );

  function defaultHeadCount(stage: string) {
    if (stage === "lactating") return herd.filter((a) => a.lactation === "lactating").length || 1;
    if (stage === "dry") return herd.filter((a) => a.lactation === "dry").length || 1;
    if (stage === "heifer") return herd.filter((a) => a.lifeStage === "heifer").length || 1;
    if (stage === "calf") return herd.filter((a) => a.lifeStage === "calf").length || 1;
    if (stage === "bull") return herd.filter((a) => a.lifeStage === "bull").length || 1;
    return herd.length || 1;
  }

  return (
    <div className="space-y-5">
      <Summary
        title="Feed & nutrition"
        description="Manage feed stock, define daily TMR ration groups, post herd feed in one click, and monitor feed cost per litre produced."
        facts={[
          { label: "Items", value: String(items.length) },
          { label: "Below minimum", value: String(low) },
          { label: "Ration groups", value: String(groups.length) },
          ...(showMoney
            ? [
                {
                  label: "Feed cost / L (30d)",
                  value: feedCostPerLitre !== null ? `₹${feedCostPerLitre.toFixed(2)}/L` : "—",
                },
              ]
            : []),
        ]}
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Feed stock &amp; rations saved.</Notice> : null}
      {query.voided ? <Notice>Feed movement voided.</Notice> : null}

      <Panel
        title="Daily ration groups (TMR)"
        description="Define per-head daily rations by herd stage and apply them in one click to post daily consumption movements."
        action={
          canSave ? (
            <RecordDialog quiet title="Create ration group" button="New ration group">
              <form action={saveRationGroup} className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Group name
                  <input name="name" required maxLength={100} placeholder="e.g. High-yield milking cows" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Target stage
                  <FormSelect
                    name="targetStage"
                    defaultValue="lactating"
                    options={[
                      { value: "lactating", label: "Lactating cows" },
                      { value: "dry", label: "Dry cows" },
                      { value: "heifer", label: "Heifers" },
                      { value: "calf", label: "Calves" },
                      { value: "bull", label: "Bulls" },
                      { value: "all", label: "Whole herd" },
                    ]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Note
                  <input name="note" maxLength={200} placeholder="e.g. 2x daily feeding schedule" className={inputClass} />
                </label>
                <div className="flex justify-end">
                  <Submit>Create group</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null
        }
      >
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ration groups configured yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => {
              const ingredients = groupItems.filter((gi) => gi.groupId === group.id);
              const costPerHead = ingredients.reduce((sum, gi) => {
                const rate = avgCostByItem.get(gi.feedItemId) ?? 0;
                return sum + Number(gi.kgPerHeadPerDay) * (rate || 0);
              }, 0);
              const suggestedHeads = defaultHeadCount(group.targetStage);

              return (
                <div key={group.id} className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{group.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        Stage: {group.targetStage}
                        {showMoney && costPerHead > 0 ? ` · ≈ ₹${Math.round(costPerHead)}/head/day` : ""}
                      </p>
                    </div>
                    {canSave && ingredients.length > 0 ? (
                      <RecordDialog title={`Apply ${group.name}`} button="Apply today">
                        <form action={applyRationGroup} className="grid gap-3">
                          <input type="hidden" name="groupId" value={group.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-sm">
                              Head count fed
                              <input name="headCount" type="number" min={1} max={5000} required defaultValue={suggestedHeads} className={inputClass} />
                            </label>
                            <label className="grid gap-1 text-sm">
                              Date
                              <input name="movedOn" type="date" defaultValue={today} className={inputClass} />
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Will post {ingredients.length} feed consumption rows calculated as head count × kg/head.
                          </p>
                          <div className="flex justify-end">
                            <Submit>Post consumption</Submit>
                          </div>
                        </form>
                      </RecordDialog>
                    ) : null}
                  </div>

                  {ingredients.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No feed ingredients added to this ration yet.</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-white text-xs">
                      {ingredients.map((ing) => {
                        const feed = itemById.get(ing.feedItemId);
                        return (
                          <li key={ing.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="font-medium">{feed?.name ?? "Unknown feed"}</span>
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums text-muted-foreground">{Number(ing.kgPerHeadPerDay).toFixed(2)} kg / head</span>
                              {canSave ? (
                                <form action={deleteRationItem}>
                                  <input type="hidden" name="id" value={ing.id} />
                                  <button type="submit" className="text-[11px] text-danger hover:underline">
                                    Remove
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {canSave && items.length > 0 ? (
                    <form action={addRationItem} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="groupId" value={group.id} />
                      <select name="feedItemId" required className="h-8 flex-1 rounded-lg border border-border bg-white px-2 text-xs">
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        name="kgPerHeadPerDay"
                        type="number"
                        min={0.1}
                        max={200}
                        step="0.1"
                        required
                        placeholder="kg/head"
                        className="h-8 w-24 rounded-lg border border-border bg-white px-2 text-xs"
                      />
                      <button type="submit" className="h-8 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90">
                        + Add
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Stock</h2>
          {canSave ? (
            <RecordDialog title="Record a movement" button="Record movement">
              <form action={saveFeed} className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Item
                  <FormSelect
                    name="itemId"
                    defaultValue=""
                    options={[{ value: "", label: "New item, named below" }, ...balances.map(({ item }) => ({ value: item.id, label: item.name }))]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  New item name (if adding new)
                  <input name="name" placeholder="New item name" className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Category
                    <FormSelect
                      name="category"
                      defaultValue="green"
                      options={FEED_CATEGORIES.map((value) => ({ value, label: feedCategoryLabel[value] }))}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Movement type
                    <FormSelect
                      name="kind"
                      defaultValue="purchase"
                      options={FEED_KINDS.map((value) => ({ value, label: feedKindLabel[value] }))}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Quantity (kg; negative allowed on Adjustment)
                    <input name="quantity" type="number" min={-1000000} max={1000000} step="0.1" required inputMode="decimal" placeholder="Quantity" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Cost per kg (₹)
                    <input name="unitCost" type="number" min={0} max={100000} step="0.01" inputMode="decimal" placeholder="Cost per kg" className={inputClass} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Date
                    <input name="movedOn" type="date" defaultValue={today} className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Minimum stock (new item)
                    <input name="minimum" type="number" min={0} max={1000000} step="0.1" inputMode="decimal" placeholder="Minimum stock, for a new item" className={inputClass} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Supplier (for purchase)
                  <input name="supplier" placeholder="Supplier, for a purchase" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Allocation (for consumption / wastage)
                  <FormSelect
                    name="allocation"
                    defaultValue=""
                    options={[
                      { value: "", label: "Where it was used" },
                      { value: "herd", label: "Herd" },
                      ...sheds.map((shed) => ({ value: `shed:${shed.id}`, label: `Shed · ${shed.name}` })),
                      ...herd.map((animal) => ({ value: `animal:${animal.code}`, label: `${animal.name ?? animal.code} · ${animal.code}` })),
                    ]}
                  />
                </label>
                <div className="flex justify-end">
                  <Submit>Save movement</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Item", "Category", "On hand", ...(showMoney ? ["Avg ₹/kg"] : []), "Minimum", "Status", ""]}>
          {balances.length === 0 ? <EmptyRow cols={showMoney ? 7 : 6}>No feed items yet.</EmptyRow> : null}
          {balances.map(({ item, balance, avgCost, low: short }) => (
            <tr key={item.id}>
              <Td className="font-medium">{item.name}</Td>
              <Td>{feedCategoryLabel[item.category] ?? item.category}</Td>
              <Td className="tabular-nums">
                {balance.toFixed(1)} {item.unit}
              </Td>
              {showMoney ? <Td className="tabular-nums">{avgCost !== null ? `₹${avgCost.toFixed(2)}` : "—"}</Td> : null}
              <Td className="text-muted-foreground">{item.minimumQuantity ? `${item.minimumQuantity} ${item.unit}` : "—"}</Td>
              <Td>
                {short ? <Pill tone="warn">Below minimum</Pill> : balance < 0 ? <Pill tone="warn">Short</Pill> : <Pill tone="good">In stock</Pill>}
              </Td>
              <Td className="text-right">
                {canSave ? (
                  <RecordDialog title={`Edit ${item.name}`} button="Edit" quiet>
                    <form action={updateFeedItem} className="space-y-3">
                      <input type="hidden" name="itemId" value={item.id} />
                      <label className="grid gap-1 text-sm">
                        Item name
                        <input name="name" required defaultValue={item.name} className={inputClass} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Minimum stock ({item.unit})
                        <input
                          name="minimum"
                          type="number"
                          min={0}
                          max={1000000}
                          step="0.1"
                          defaultValue={item.minimumQuantity ?? ""}
                          placeholder="Leave blank for no minimum alert"
                          className={inputClass}
                        />
                      </label>
                      <div className="flex justify-end">
                        <Submit>Save item</Submit>
                      </div>
                    </form>
                  </RecordDialog>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Movements</h2>
        <Table headers={["Date", "Item", "Kind", "Quantity", "Cost", "Detail", ""]}>
          {history.length === 0 ? <EmptyRow cols={7}>No movements yet.</EmptyRow> : null}
          {history.map((movement) => {
            const item = itemById.get(movement.itemId);
            const allowVoid = !movement.voidedAt && canVoidRecord(farm.roles, "feed_movement", movement.createdBy, farm.userId, movement.createdAt);
            return (
              <tr key={movement.id} className={movement.voidedAt ? "text-muted-foreground line-through" : ""}>
                <Td>{formatDisplayDate(movement.movedOn)}</Td>
                <Td className="font-medium">{item?.name ?? "—"}</Td>
                <Td>{feedKindLabel[movement.kind] ?? movement.kind}</Td>
                <Td className="tabular-nums">
                  {feedQuantityLabel(movement.kind, movement.quantity)} {item?.unit ?? "kg"}
                </Td>
                <Td>{movement.unitCost ? `₹${Number(movement.unitCost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</Td>
                <Td>{movement.note ?? "—"}</Td>
                <Td className="text-right">
                  {movement.voidedAt ? (
                    <span className="text-xs no-underline">Voided</span>
                  ) : allowVoid ? (
                    <VoidRecord entity="feed_movement" id={movement.id} returnTo="/feed" />
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
