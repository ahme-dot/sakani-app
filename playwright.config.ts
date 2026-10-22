import { defineConfig } from "@playwright/test";

// `npm test` starts a dev server on port 3100 and checks it; `npm run test:live` checks the live site.
// Set SAKANI_TEST_URL to check a server that is already running instead (e.g. http://localhost:3000).
const LIVE_URL = "https://sakani-app-olive.vercel.app";
const LOCAL_URL = process.env.SAKANI_TEST_URL ?? "http://localhost:3100";
const isLive = process.argv.some((arg) => arg === "--project=live" || arg === "live");
const startServer = !isLive && !process.env.SAKANI_TEST_URL;

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // the tests share one Supabase database
  retries: 1,
  reporter: [["list"]],
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    channel: "msedge", // the Edge already installed on Windows; no browser download needed
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "local", use: { baseURL: LOCAL_URL } },
    { name: "live", use: { baseURL: LIVE_URL } },
  ],
  webServer: !startServer
    ? undefined
    : { command: "npm run dev -- --port 3100", url: "http://localhost:3100/en", reuseExistingServer: true, timeout: 300_000 },
});
