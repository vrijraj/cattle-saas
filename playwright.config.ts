// Playwright E2E configuration (run with: npx playwright test)
const config = {
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3007",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
  ],
};

export default config;
