// End-to-end smoke suite for desktop & 375px mobile viewports.
// Execute against a running server (`pnpm dev` or `pnpm start`):
//   npx playwright test e2e/smoke.spec.ts

export const SMOKE_SCENARIOS = [
  {
    name: "Health API returns ok + db ready",
    path: "/api/health",
    expectStatus: 200,
  },
  {
    name: "Public landing page renders signup & demo links",
    path: "/",
    expectText: "Every cow, milk drop, straw, and rupee",
  },
  {
    name: "Public demo farm catalogue & shop load without auth",
    path: "/farms/shree-gir",
    expectText: "Published catalogue",
  },
  {
    name: "Sign-in flow reaches dashboard & milk sheet",
    path: "/signin",
    credentials: { email: "asha@shreegir.test", password: "demo-farm-2026" },
    postLoginPaths: ["/dashboard", "/animals", "/animals/bulk", "/animals/labels", "/milk", "/health", "/feed", "/semen", "/alerts", "/settings", "/admin"],
  },
] as const;
