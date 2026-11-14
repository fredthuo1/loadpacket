import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test",
  testMatch: "access.spec.ts",
  workers: 1,
  timeout: 120_000,
  outputDir: "../../test-results/access/browser",
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
    trace: "off",
  },
  webServer: [
    {
      command: "node test/access-provider-fixture.mjs",
      url: "http://127.0.0.1:3104/health",
      reuseExistingServer: false,
    },
    {
      command: "node ../api/test/access.database.cjs",
      url: "http://127.0.0.1:3105/api/v1/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        RUN_ACCESS_TESTS: "1",
        ACCESS_BROWSER_FIXTURE: "1",
        DATABASE_URL:
          "postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test",
        SUPABASE_URL: "http://127.0.0.1:3104",
        SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key",
      },
    },
    {
      command:
        "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        LOADPACKET_AUTH_TEST: "1",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3105/api/v1",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3104",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key",
      },
    },
  ],
});
