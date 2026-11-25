import { expect, test } from "@playwright/test";

test.describe("Public & unauthenticated security boundaries", () => {
  test("health API returns ok and database ready", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.db).toBe("ok");
  });

  test("landing page and public demo catalogue render without sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Every cow, milk drop");

    await page.goto("/farms/shree-gir");
    await expect(page.getByRole("heading", { name: "Published catalogue" })).toBeVisible();

    await page.goto("/farms/shree-gir/shop");
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
  });

  test("private routes and APIs require authentication", async ({ page, request }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin/);

    const searchRes = await request.get("/api/herd-search?q=gir");
    expect(searchRes.status()).toBe(401);

    const iotRes = await request.post("/api/iot/ingest", { data: { milk: [] } });
    expect(iotRes.status()).toBe(401);
  });
});

test.describe("Authenticated farm owner & RBAC journeys", () => {
  test("owner can sign in and access core dairy modules with no horizontal overflow", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill("asha@shreegir.test");
    await page.getByLabel("Password").fill("demo-farm-2026");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    const routes = ["/animals", "/animals/bulk", "/animals/labels", "/milk", "/health", "/feed", "/semen", "/alerts", "/settings", "/admin"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, "\\/")));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      expect(overflow, `Horizontal overflow detected on ${route}`).toBe(false);
    }
  });

  test("worker role cannot open admin, finance, settings, or team screens", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill("lata@shreegir.test");
    await page.getByLabel("Password").fill("demo-farm-2026");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    for (const restricted of ["/admin", "/finance", "/settings", "/team"]) {
      await page.goto(restricted);
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });
});
