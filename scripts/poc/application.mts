import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { root } from "./schema.mts";
import type { Target } from "./core.mts";
export function prepareWorkspace(output: string, target: Target) {
  const workspace = join(output, "workspace"),
    api = join(workspace, "apps/api");
  assert(
    !existsSync(workspace),
    "Use a new run; never overwrite a prior workspace",
  );
  mkdirSync(api, { recursive: true });
  for (const name of [
    "src",
    "test",
    "prisma",
    "package.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "nest-cli.json",
    "eslint.config.mjs",
  ]) {
    const source = join(root, "apps/api", name);
    if (existsSync(source))
      cpSync(source, join(api, name), { recursive: true });
  }
  mkdirSync(join(workspace, "packages"), { recursive: true });
  cpSync(
    join(root, "packages/api-contracts"),
    join(workspace, "packages/api-contracts"),
    { recursive: true },
  );
  // Link each resolved package, not the parent node_modules: relative pnpm links
  // inside a Windows directory junction otherwise resolve from the copied tree.
  const installed = join(root, "apps/api/node_modules"),
    modules = join(api, "node_modules");
  mkdirSync(modules);
  for (const entry of readdirSync(installed).filter(
    (name) => !name.startsWith("."),
  )) {
    if (entry.startsWith("@")) {
      mkdirSync(join(modules, entry));
      for (const name of readdirSync(join(installed, entry)))
        symlinkSync(
          realpathSync(join(installed, entry, name)),
          join(modules, entry, name),
          "junction",
        );
    } else
      symlinkSync(
        realpathSync(join(installed, entry)),
        join(modules, entry),
        "junction",
      );
  }
  writeFileSync(
    join(api, "prisma.config.ts"),
    `import {defineConfig,env} from 'prisma/config';\nexport default defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},datasource:{url:env('DATABASE_URL')}});\n`,
  );
  for (const name of [
    "finance.database.ts",
    "signatures.database.ts",
    "finance.database.cjs",
    "signatures.database.cjs",
  ]) {
    const file = join(api, "test", name);
    let text = readFileSync(file, "utf8");
    assert(
      text.includes("'55439'") &&
        text.includes("'/loadpacket_finance_verified_test'"),
      "Source guard changed; adapter needs review",
    );
    text = text
      .replaceAll("'55439'", JSON.stringify(String(target.port)))
      .replaceAll(
        "'/loadpacket_finance_verified_test'",
        JSON.stringify("/" + target.database),
      );
    writeFileSync(file, text);
  }
  // No production .env or provider credentials are copied. Source semantics stay unchanged.
  return api;
}
export const commands: Record<string, string[][]> = {
  prisma: [
    ["node_modules/prisma/build/index.js", "validate"],
    ["node_modules/prisma/build/index.js", "generate"],
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ],
  application: [
    ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"],
    ["node_modules/eslint/bin/eslint.js", "src/**/*.ts", "test/**/*.ts"],
    ["node_modules/@nestjs/cli/bin/nest.js", "build"],
    [
      "--experimental-vm-modules",
      "node_modules/jest/bin/jest.js",
      "--runInBand",
    ],
    [
      "node_modules/jest/bin/jest.js",
      "--config",
      "test/jest-e2e.json",
      "--runInBand",
    ],
  ],
  database: [
    ["test/finance.database.cjs"],
    ["test/signatures.database.cjs"],
    ["-r", "ts-node/register", "test/stop-events.database.ts"],
    ["-r", "ts-node/register", "test/payments.database.ts"],
    ["-r", "ts-node/register", "test/company-drivers.database.ts"],
  ],
};
export function safeChildEnvironment(connectionString: string, api: string) {
  // Deliberate allowlist, never spread process.env into provider-capable application tests.
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    DATABASE_URL: connectionString,
    NODE_ENV: "test",
    CI: "true",
    NO_COLOR: "1",
    RUN_FINANCE_DATABASE_TESTS: "1",
    RUN_MOBILE_DATABASE_TESTS: "1",
    RUN_DAY7_DATABASE_TESTS: "1",
    RUN_DAY7A_DATABASE_TESTS: "1",
    DOCUMENT_STORAGE_ROOT: resolve(api, "test-results/storage"),
    TS_NODE_EXPERIMENTAL_RESOLVER: "true",
  });
  return env;
}
export function executeCommand(
  api: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  log: string,
) {
  const result = spawnSync(process.execPath, args, {
    cwd: api,
    env,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
  });
  let text = (result.stdout ?? "") + (result.stderr ?? "");
  if (env.DATABASE_URL)
    text = text.replaceAll(env.DATABASE_URL, "[REDACTED_POC_CONNECTION]");
  text = text.replace(
    /postgres(?:ql)?:\/\/[^\s'"`]+/gi,
    "[REDACTED_CONNECTION]",
  );
  writeFileSync(log, text, { mode: 0o600 });
  return {
    command: args.join(" "),
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    spawnError: result.error ? "PROCESS_FAILED_OR_TIMED_OUT" : null,
  };
}
