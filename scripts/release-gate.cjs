// Repeatable, fail-fast release gate. Never migrates, seeds, resets, purchases, or sends email.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const scopeArg = args.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg?.slice("--scope=".length) || "mobile";
if (
  !["mobile", "api", "release", "full", "quick", "live"].includes(scope) ||
  args.some((arg) => !arg.startsWith("--scope=") && arg !== "--skip-export")
) {
  console.error(
    "Usage: node scripts/release-gate.cjs --scope=mobile|api|release|full|quick|live [--skip-export]",
  );
  process.exit(2);
}
const startedAt = new Date().toISOString();
const output = path.join(
  root,
  "test-results",
  "regression",
  startedAt.replace(/[:.]/g, "-"),
);
fs.mkdirSync(output, { recursive: true });
const report = {
  scope,
  startedAt,
  completedAt: null,
  status: "RUNNING",
  bundleExport: !args.includes("--skip-export"),
  checks: [],
  externalAcceptance: [
    "Native device login/camera/location",
    "Supabase carrier invitation onboarding",
    "RevenueCat sandbox purchase/restore and store configuration",
  ],
};
const steps = [];
const pnpm = (name, filter, ...command) =>
  steps.push({
    name,
    tool: "pnpm",
    args: [
      "--config.verify-deps-before-run=false",
      "--filter",
      filter,
      ...command,
    ],
  });
if (["mobile", "release", "full"].includes(scope)) {
  steps.push({
    name: "Mobile source security audit",
    tool: "node",
    args: ["scripts/mobile-audit.cjs"],
  });
  pnpm("Mobile typecheck", "mobile", "typecheck");
  pnpm("Mobile lint", "mobile", "lint");
  pnpm("Mobile tests", "mobile", "test");
  pnpm("Expo compatibility", "mobile", "exec", "expo", "install", "--check");
  if (!args.includes("--skip-export"))
    pnpm("Android and iOS bundles", "mobile", "export");
}
if (["api", "release", "full"].includes(scope)) {
  pnpm("Prisma schema validation", "api", "exec", "prisma", "validate");
  pnpm("Prisma client generation", "api", "exec", "prisma", "generate");
  if (scope === "full")
    pnpm(
      "Prisma migration status",
      "api",
      "exec",
      "prisma",
      "migrate",
      "status",
    );
  pnpm("API typecheck", "api", "typecheck");
  pnpm("API lint", "api", "lint");
  pnpm("API build", "api", "build");
  pnpm("API unit regression", "api", "test", "--runInBand");
  pnpm("API HTTP regression", "api", "test:e2e", "--runInBand");
}
if (scope === "full") {
  if (process.env.RUN_FINANCE_DATABASE_TESTS === "1")
    pnpm(
      "Signature isolated database and HTTP integrity",
      "api",
      "exec",
      "node",
      "test/signatures.database.cjs",
    );
  if (process.env.RUN_FINANCE_DATABASE_TESTS === "1")
    pnpm(
      "Finance isolated database and HTTP integrity",
      "api",
      "exec",
      "node",
      "test/finance.database.cjs",
    );
  else
    report.externalAcceptance.push(
      "Finance DB tests NOT_RUN: set RUN_FINANCE_DATABASE_TESTS=1 with the dedicated localhost finance test DATABASE_URL",
    );
  pnpm("Web typecheck", "web", "typecheck");
  pnpm("Web lint", "web", "lint");
  pnpm("Web build", "web", "build");
  pnpm("Web browser regression", "web", "test:e2e");
  pnpm(
    "Expo public configuration",
    "mobile",
    "exec",
    "expo",
    "config",
    "--type",
    "public",
  );
  if (process.env.RUN_MOBILE_DATABASE_TESTS === "1")
    pnpm(
      "Isolated database integrity and concurrency",
      "api",
      "exec",
      "tsx",
      "test/stop-events.database.ts",
    );
  else
    report.externalAcceptance.push(
      "Isolated DB tests NOT_RUN: explicitly set RUN_MOBILE_DATABASE_TESTS=1 against a configured development/test database",
    );
}
if (scope === "quick") {
  pnpm("API typecheck", "api", "typecheck");
  pnpm("Mobile typecheck", "mobile", "typecheck");
  pnpm(
    "Detention unit tests",
    "api",
    "test",
    "--runInBand",
    "detention.spec.ts",
  );
  pnpm(
    "Product sprint HTTP tests",
    "api",
    "test:e2e",
    "--runInBand",
    "product-sprint.e2e-spec.ts",
  );
  pnpm("Mobile tests", "mobile", "test");
}
if (scope !== "live")
  steps.push({
    name: "Secret audit self-tests",
    tool: "node",
    args: ["--test", "scripts/product-secret-audit.test.cjs"],
  });
if (scope !== "live")
  steps.push({
    name: "Product source and build secret audit",
    tool: "node",
    args: ["scripts/product-secret-audit.cjs"],
  });
if (scope === "live") {
  report.status = "MANUAL_REQUIRED";
  report.externalAcceptance.push(
    "Execute docs/regression-scenario-matrix.md live checklist and record observed results. No provider operations executed.",
  );
  process.exitCode = 2;
}
function save() {
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(output, "results.md"),
    `# LoadPacket regression\n\nScope: ${scope}\nStatus: ${report.status}\nStarted: ${startedAt}\n\n${report.checks.map((check) => `- ${check.status}: ${check.name} (${check.durationMs} ms)${check.testTotals ? ` — ${check.testTotals}` : ""}; log: ${check.log}`).join("\n")}\n\n## External acceptance\n\n${report.externalAcceptance.map((item) => `- MANUAL_REQUIRED: ${item}`).join("\n")}\n`,
  );
}
save();
for (const [index, step] of steps.entries()) {
  console.log(`[${index + 1}/${steps.length}] ${step.name}`);
  const before = Date.now();
  // Commands/arguments come exclusively from the fixed allowlisted steps above.
  const command =
    step.tool === "node"
      ? process.execPath
      : process.platform === "win32"
        ? process.env.ComSpec || "cmd.exe"
        : "pnpm";
  const commandArgs =
    step.tool === "pnpm" && process.platform === "win32"
      ? ["/d", "/s", "/c", `pnpm ${step.args.join(" ")}`]
      : step.args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
    encoding: "utf8",
    windowsHide: true,
    timeout: 15 * 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const log = `${String(index + 1).padStart(2, "0")}-${step.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.log`;
  fs.writeFileSync(
    path.join(output, log),
    (result.stdout || "") +
      (result.stderr || "") +
      (result.error ? `\n${result.error.message}` : ""),
  );
  const passed = result.status === 0 && !result.error;
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  const totals = [
    ...combined.matchAll(
      /Tests:\s+[^\r\n]+|# tests \d+|\d+ passed(?: \([^\r\n]+\))?/g,
    ),
  ].map((match) => match[0]);
  report.checks.push({
    name: step.name,
    command: [step.tool, ...step.args],
    status: passed ? "PASS" : "FAIL",
    exitCode: result.status,
    durationMs: Date.now() - before,
    log,
    testTotals: totals.join("; ") || null,
  });
  save();
  console.log(
    `${passed ? "PASS" : "FAIL"} ${step.name} (${((Date.now() - before) / 1000).toFixed(1)}s)`,
  );
  if (!passed) {
    report.status = "FAIL";
    process.exitCode = 1;
    break;
  }
}
report.completedAt = new Date().toISOString();
if (report.status === "RUNNING") report.status = "PASS";
save();
console.log(
  `Gate ${report.status}. Results: ${path.relative(root, path.join(output, "results.json"))}`,
);
