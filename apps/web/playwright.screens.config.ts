import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";

export default defineConfig({
  ...access,
  testMatch: ["access.spec.ts", "screens-access.spec.ts"],
  outputDir: "../../test-results/b4-ui/access",
  webServer: [
    {
      command: "node test/access-provider-fixture.mjs",
      url: "http://127.0.0.1:3104/health",
      reuseExistingServer: false,
    },
    {
      command:
        "pnpm --config.verify-deps-before-run=false --filter api exec node test/screens-browser-fixture.cjs",
      url: "http://127.0.0.1:3105/api/v1/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        LOADPACKET_AUTH_TEST: "1",
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/never_connect",
        SUPABASE_URL: "http://127.0.0.1:3104",
        SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key",
      },
    },
    ...(Array.isArray(access.webServer) ? [access.webServer[2]] : []),
  ],
});
