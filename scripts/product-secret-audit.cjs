// Values are compared in memory only. Never echo matching content or credentials.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const sensitive =
  /^(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DOCUMENT_DOWNLOAD_SECRET|SMTP_PASSWORD|REVENUECAT_SECRET_API_KEY)$/;
const forbidden = [];
for (const relative of ["apps/api/.env", ".env"]) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && sensitive.test(match[1])) {
      const value = match[2].replace(/^['"]|['"]$/g, "");
      if (value.length >= 16) forbidden.push(value);
    }
  }
}
for (const [key, value] of Object.entries(process.env))
  if (sensitive.test(key) && value && value.length >= 16) forbidden.push(value);
const failures = [];
let count = 0;
function hasSecret(content, values, clientSource) {
  const privateJwt = [
    ...content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g),
  ].some(([token]) => {
    try {
      // Legacy Supabase anon keys are intentionally public; user/service JWTs are not.
      return (
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
          .role !== "anon"
      );
    } catch {
      return true;
    }
  });
  return (
    values.some((value) => content.includes(value)) ||
    privateJwt ||
    /sb_secret_[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(
      content,
    ) ||
    (clientSource &&
      /process\.env\.(?:DATABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DOCUMENT_DOWNLOAD_SECRET|SMTP_PASSWORD|REVENUECAT_SECRET_API_KEY)/.test(
        content,
      ))
  );
}
function scan(folder, client) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        ".git",
        "cache",
        "generated",
        ".expo",
        "android",
        "ios",
      ].includes(entry.name) ||
      entry.name.startsWith(".env")
    )
      continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      scan(file, client);
      continue;
    }
    if (!/\.(?:tsx?|[cm]?js|json|html|hbc)$/.test(file)) continue;
    const content = fs.readFileSync(file).toString("utf8");
    count++;
    if (hasSecret(content, forbidden, client))
      failures.push(path.relative(root, file));
  }
}
if (require.main === module) {
  scan(path.join(root, "apps/web/src"), true);
  // Bundles include dependency documentation mentioning env variable names.
  // Still scan all bundled bytes for configured values and credential patterns.
  scan(path.join(root, "apps/web/.next"), false);
  scan(path.join(root, "apps/mobile"), true);
  scan(path.join(root, "apps/api/src"), false);
  if (failures.length) {
    console.error(
      "Secret audit FAIL (matched values suppressed):\n" +
        [...new Set(failures)].join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      `Secret audit PASS: ${count} source/config/build files; configured server values absent; no matching private-key patterns. Broker token database/redaction tests are separate.`,
    );
}
module.exports = { hasSecret };
