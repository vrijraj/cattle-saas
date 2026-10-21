import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feedItems, feedMovements } from "@/db/schema";
import { saveFeed } from "@/app/(farm)/herd/actions";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const signed = { opening: 1, purchase: 1, consumption: -1, wastage: -1, adjustment: 1 };

export default async function FeedPage() {
  const farm = await requireFarm();
  const items = await db.select().from(feedItems).where(eq(feedItems.farmId, farm.farmId));
  const movements = await db.select().from(feedMovements).where(eq(feedMovements.farmId, farm.farmId));
  const balances = items.map((item) => {
    const balance = movements
      .filter((movement) => movement.itemId === item.id)
      .reduce((sum, movement) => sum + Number(movement.quantity) * (signed[movement.kind as keyof typeof signed] ?? 1), 0);
    return { item, balance };
  });
  const low = balances.filter((row) => row.item.minimumQuantity && row.balance <= Number(row.item.minimumQuantity)).length;

  return (
    <div className="space-y-5">
      <Summary
        title="Feed & nutrition"
        description="Stock on hand, purchases, and what the herd has used."
        facts={[
          { label: "Items", value: String(items.length) },
          { label: "Movements", value: String(movements.length) },
          { label: "Below minimum", value: String(low) },
        ]}
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Stock</h2>
          <RecordDialog title="Record a movement" button="Record movement">
            <form action={saveFeed} className="grid gap-3">
              <select name="itemId" className={inputClass}>
                <option value="">New item, named below</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input name="name" placeholder="New item name" className={inputClass} />
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="category" className={inputClass}>
                  <option value="green">Green fodder</option>
                  <option value="dry">Dry fodder</option>
                  <option value="silage">Silage</option>
                  <option value="concentrate">Concentrate</option>
                  <option value="mineral">Mineral</option>
                </select>
                <select name="kind" className={inputClass}>
                  <option value="opening">Opening</option>
                  <option value="purchase">Purchase</option>
                  <option value="consumption">Consumption</option>
                  <option value="wastage">Wastage</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="quantity" required placeholder="Quantity kg" className={inputClass} />
                <input name="unitCost" placeholder="Cost per kg" className={inputClass} />
              </div>
              <input name="minimum" placeholder="Minimum stock" className={inputClass} />
              <div className="flex justify-end">
                <Submit>Save movement</Submit>
              </div>
            </form>
          </RecordDialog>
        </div>
      <Table headers={["Item", "Category", "On hand", "Minimum", "Status"]}>
        {balances.length === 0 ? <EmptyRow cols={5}>No feed items yet.</EmptyRow> : null}
        {balances.map(({ item, balance }) => {
          const short = Boolean(item.minimumQuantity && balance <= Number(item.minimumQuantity));
          return (
            <tr key={item.id}>
              <Td className="font-medium">{item.name}</Td>
              <Td className="capitalize">{item.category}</Td>
              <Td>
                {balance.toFixed(1)} {item.unit}
              </Td>
              <Td className="text-muted-foreground">{item.minimumQuantity ? `${item.minimumQuantity} ${item.unit}` : "—"}</Td>
              <Td>{short ? <Pill tone="warn">Below minimum</Pill> : <Pill tone="good">In stock</Pill>}</Td>
            </tr>
          );
        })}
      </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Movements</h2>
        <Table headers={["Date", "Item", "Kind", "Quantity"]}>
          {movements.length === 0 ? <EmptyRow cols={4}>No movements yet.</EmptyRow> : null}
          {[...movements]
            .sort((a, b) => b.movedOn.localeCompare(a.movedOn))
            .map((movement) => {
              const item = items.find((row) => row.id === movement.itemId);
              return (
                <tr key={movement.id}>
                  <Td>{formatDisplayDate(movement.movedOn)}</Td>
                  <Td className="font-medium">{item?.name ?? "—"}</Td>
                  <Td className="capitalize">{movement.kind}</Td>
                  <Td>
                    {movement.quantity} {item?.unit ?? "kg"}
                  </Td>
                </tr>
              );
            })}
        </Table>
      </section>
    </div>
  );
}
