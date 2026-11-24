import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { animals, feedItems, feedMovements, locations } from "@/db/schema";
import { saveFeed, updateFeedItem } from "@/app/(farm)/herd/actions";
import { farmToday, formatDisplayDate } from "@/lib/dates";
import { feedBalance, feedCategoryLabel, feedIsLow, feedKindLabel, feedQuantityLabel, FEED_CATEGORIES, FEED_KINDS } from "@/lib/feed-stock";
import { requireFarm } from "@/lib/farm-context";
import { canRecordFeed, canVoidRecord } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { VoidRecord } from "@/components/void-record";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const messages: Record<string, string> = {
  role: "Your role cannot record feed.",
  item: "Choose an item on this farm, or name a new one.",
  quantity: "Enter a non-zero quantity (negative values are allowed only for Adjustment).",
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
  const [items, movements, sheds, herd] = await Promise.all([
    db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId)),
    db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId)),
    db.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.farmId, farm.farmId), eq(locations.active, true))).orderBy(locations.name),
    db
      .select({ code: animals.code, name: animals.name })
      .from(animals)
      .where(and(eq(animals.farmId, farm.farmId), eq(animals.presence, "on_farm")))
      .orderBy(animals.code),
  ]);
  const activeMovements = movements.filter((movement) => !movement.voidedAt);
  const balances = items
    .map((item) => {
      const balance = feedBalance(activeMovements.filter((movement) => movement.itemId === item.id));
      return { item, balance, low: feedIsLow(balance, item.minimumQuantity) };
    })
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
  const low = balances.filter((row) => row.low).length;
  const canSave = canRecordFeed(farm.roles);
  const history = [...movements].sort(
    (left, right) => right.movedOn.localeCompare(left.movedOn) || right.createdAt.getTime() - left.createdAt.getTime(),
  );

  return (
    <div className="space-y-5">
      <Summary
        title="Feed & nutrition"
        description="On hand is the opening balance plus purchases, minus consumption and wastage. An adjustment can be positive or negative."
        facts={[
          { label: "Items", value: String(items.length) },
          { label: "Active movements", value: String(activeMovements.length) },
          { label: "Below minimum", value: String(low) },
        ]}
      />
      {query.error && messages[query.error] ? <Notice tone="danger">{messages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Feed stock saved.</Notice> : null}
      {query.voided ? <Notice>Feed movement voided.</Notice> : null}
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
                <p className="text-xs text-muted-foreground">Category and minimum are saved with a new item. Use a negative quantity with Adjustment to reduce stock.</p>
                <div className="flex justify-end">
                  <Submit>Save movement</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Item", "Category", "On hand", "Minimum", "Status", ""]}>
          {balances.length === 0 ? <EmptyRow cols={6}>No feed items yet.</EmptyRow> : null}
          {balances.map(({ item, balance, low: short }) => (
            <tr key={item.id}>
              <Td className="font-medium">{item.name}</Td>
              <Td>{feedCategoryLabel[item.category] ?? item.category}</Td>
              <Td className="tabular-nums">
                {balance.toFixed(1)} {item.unit}
              </Td>
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
            const item = items.find((row) => row.id === movement.itemId);
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
