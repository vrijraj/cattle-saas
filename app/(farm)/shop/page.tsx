import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, orders, products } from "@/db/schema";
import { saveProduct, saveStockListing } from "@/app/(farm)/herd/actions";
import { updateOrderStatus } from "@/app/(farm)/shop/actions";
import { requireFarm } from "@/lib/farm-context";
import { canPublish } from "@/lib/permissions";
import { FormSelect } from "@/components/form-select";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Pill, Submit, Summary, Table, Td } from "@/components/workspace";

const nextStatus: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  paid: ["packed", "cancelled", "refunded"],
  packed: ["shipped", "cancelled"],
  shipped: ["completed"],
};

const shopMessages: Record<string, string> = {
  role: "Your role cannot manage the public shop or listings.",
  product: "Enter a product name.",
  price: "Price must be a valid amount greater than zero.",
  stock: "Stock must be a whole number of zero or more.",
  listing: "Enter a valid category and public listing note.",
  status: "That order status transition is not allowed.",
};

export const metadata = { title: "Shop catalogue" };

export default async function ShopAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; saved?: string }> }) {
  const farm = await requireFarm();
  const query = await searchParams;
  const term = query.q?.trim().toLowerCase() ?? "";
  const catalogue = (await db.select().from(products).where(eq(products.farmId, farm.farmId))).filter(
    (product) => !term || product.name.toLowerCase().includes(term) || product.category.toLowerCase().includes(term),
  );
  const orderRows = await db.select().from(orders).where(eq(orders.farmId, farm.farmId));
  const catalogueListings = await db.select().from(listings).where(eq(listings.farmId, farm.farmId));
  const canAdd = canPublish(farm.roles);

  return (
    <div className="space-y-5">
      <Summary
        title="Shop"
        description={term ? `Products matching “${query.q?.trim()}”.` : "Product stock is the sellable quantity. Selling it does not use farm AI straws. Live animals stay on the catalogue as enquiries."}
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
      {query.error && shopMessages[query.error] ? <Notice tone="danger">{shopMessages[query.error]}</Notice> : null}
      {query.saved ? <Notice>Catalogue changes saved.</Notice> : null}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Products</h2>
          {canAdd ? (
            <RecordDialog title="Add product" button="Add product">
              <form action={saveProduct} className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Product name
                  <input name="name" required maxLength={120} placeholder="Product" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Category
                  <input name="category" maxLength={60} placeholder="Category (e.g. dairy, ghee)" className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Price (₹)
                    <input name="price" type="number" min={0.01} max={10000000} step="0.01" required inputMode="decimal" placeholder="Price" className={inputClass} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Stock quantity
                    <input name="stock" type="number" min={0} max={1000000} step={1} required inputMode="numeric" placeholder="Stock" className={inputClass} />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Submit>Add product</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
      <Table headers={["Product", "Category", "Price", "Stock"]}>
        {catalogue.length === 0 ? <EmptyRow cols={4}>{term ? "No products match this search." : "No products yet."}</EmptyRow> : null}
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
                <Pill tone={order.status === "paid" || order.status === "completed" ? "good" : "warn"}>{order.status.replaceAll("_", " ")}</Pill>
                <p className="mt-1 text-xs text-muted-foreground">/farms/{farm.farmSlug}/orders/{order.id}</p>
                {canAdd && (nextStatus[order.status]?.length ?? 0) > 0 ? (
                  <form action={updateOrderStatus} className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={order.id} />
                    <FormSelect name="status" options={(nextStatus[order.status] ?? []).map((status) => ({ value: status, label: status.replaceAll("_", " ") }))} />
                    <Submit>Update</Submit>
                  </form>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Semen and embryo listings</h2>
          {canAdd ? (
            <RecordDialog title="Publish listing" button="Publish listing">
              <form action={saveStockListing} className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Category
                  <FormSelect
                    name="category"
                    defaultValue="semen"
                    options={[
                      { value: "semen", label: "Semen" },
                      { value: "embryos", label: "Embryos" },
                    ]}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Public listing note
                  <input name="title" required maxLength={240} placeholder="What the public page should say" className={inputClass} />
                </label>
                <label className="grid gap-1 text-sm">
                  Price (₹)
                  <input name="price" type="number" min={0} max={100000000} step="0.01" inputMode="decimal" placeholder="Price" className={inputClass} />
                </label>
                <div className="flex justify-end">
                  <Submit>Publish</Submit>
                </div>
              </form>
            </RecordDialog>
          ) : null}
        </div>
        <Table headers={["Category", "Text", "Price"]}>
          {catalogueListings.filter((row) => !row.animalId).length === 0 ? <EmptyRow cols={3}>No semen or embryo listing yet.</EmptyRow> : null}
          {catalogueListings
            .filter((row) => !row.animalId)
            .map((row) => (
              <tr key={row.id}>
                <Td className="capitalize">{row.category}</Td>
                <Td>{row.publicNote ?? "—"}</Td>
                <Td>{row.price ? `₹${Number(row.price).toLocaleString("en-IN")}` : "—"}</Td>
              </tr>
            ))}
        </Table>
      </section>
    </div>
  );
}
