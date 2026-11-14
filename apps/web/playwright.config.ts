import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --config.verify-deps-before-run=false --filter api exec node test/ratecon-browser-fixture.cjs",
      url: "http://127.0.0.1:3102/api/v1/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: { NODE_ENV: "test", LOADPACKET_AUTH_TEST: "1" },
    },
    {
      command: "node test/auth-fixture.mjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        LOADPACKET_AUTH_TEST: "1",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3101/api/v1",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key",
      },
    },
  ],
});
