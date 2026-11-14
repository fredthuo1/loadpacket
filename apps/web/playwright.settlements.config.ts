import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer : []),
    {
      command: "node ../api/test/settlements.database.cjs",
      url: "http://127.0.0.1:3103/api/v1/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL:
          "postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test",
        RUN_SETTLEMENT_TESTS: "1",
        SETTLEMENT_BROWSER_FIXTURE: "1",
      },
    },
  ],
});
