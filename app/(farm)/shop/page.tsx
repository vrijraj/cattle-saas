import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { saveProduct } from "@/app/(farm)/herd/actions";
import { requireFarm } from "@/lib/farm-context";
import { canPublish } from "@/lib/permissions";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

export default async function ShopAdminPage() {
  const farm = await requireFarm();
  const catalogue = await db.select().from(products).where(eq(products.farmId, farm.farmId));
  const orderRows = await db.select().from(orders).where(eq(orders.farmId, farm.farmId));
  const canAdd = canPublish(farm.roles);

  return (
    <div className="space-y-5">
      <Summary
        title="Shop"
        description="Products published for the public catalogue."
        facts={[
          { label: "Products", value: String(catalogue.length) },
          { label: "Orders", value: String(orderRows.length) },
        ]}
        action={
          <Link href={`/farms/${farm.farmSlug}/shop`} className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium">
            View public shop
          </Link>
        }
      />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Products</h2>
          {canAdd ? (
            <RecordDialog title="Add product" button="Add product">
              <form action={saveProduct} className="grid gap-3">
                <input name="name" required placeholder="Product" className={inputClass} />
                <input name="category" placeholder="Category" className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="price" required placeholder="Price" className={inputClass} />
                  <input name="stock" required placeholder="Stock" className={inputClass} />
                </div>
                <div className="flex justify-end">
                  <Submit>Add product</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Product", "Category", "Price", "Stock"]}>
        {catalogue.length === 0 ? <EmptyRow cols={4}>No products yet.</EmptyRow> : null}
        {catalogue.map((product) => (
          <tr key={product.id}>
            <Td className="font-medium">{product.name}</Td>
            <Td className="capitalize">{product.category}</Td>
            <Td>₹{Number(product.price).toLocaleString("en-IN")}</Td>
            <Td>{product.stock}</Td>
          </tr>
        ))}
      </Table>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Orders</h2>
        <Table headers={["Customer", "Phone", "Amount", "Status"]}>
          {orderRows.length === 0 ? <EmptyRow cols={4}>No orders yet.</EmptyRow> : null}
          {orderRows.map((order) => (
            <tr key={order.id}>
              <Td className="font-medium">{order.customerName}</Td>
              <Td>{order.phone}</Td>
              <Td>₹{Number(order.amount).toLocaleString("en-IN")}</Td>
              <Td>
                <Pill tone={order.status === "paid" ? "good" : "warn"}>{order.status.replaceAll("_", " ")}</Pill>
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
