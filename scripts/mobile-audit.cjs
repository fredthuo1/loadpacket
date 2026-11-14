const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "apps", "mobile");
const failures = [];
const ignored = new Set(["node_modules", "dist", ".expo", "android", "ios"]);
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      scan(file);
      continue;
    }
    if (entry.name.startsWith(".env") && entry.name !== ".env.example")
      continue;
    if (
      !/\.(tsx?|[cm]?js|json)$/.test(entry.name) &&
      entry.name !== ".env.example"
    )
      continue;
    const content = fs.readFileSync(file, "utf8");
    if (
      /SUPABASE_SECRET_KEY|sb_secret_|service_role|DATABASE_URL|DOCUMENT_DOWNLOAD_SECRET|-----BEGIN .*PRIVATE KEY-----/.test(
        content,
      )
    )
      failures.push(path.relative(root, file));
    if (
      /(?:watchPositionAsync|startLocationUpdatesAsync|requestBackgroundPermissionsAsync)\s*\(/.test(
        content,
      )
    )
      failures.push(
        `${path.relative(root, file)}: background/continuous tracking`,
      );
  }
}
scan(root);
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const location = config.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
)?.[1];
if (
  !location ||
  location.isIosBackgroundLocationEnabled ||
  location.isAndroidBackgroundLocationEnabled
)
  failures.push("Location must be foreground only");
if (
  !config.android.blockedPermissions.includes(
    "android.permission.ACCESS_BACKGROUND_LOCATION",
  )
)
  failures.push("Background location must remain blocked");
if (failures.length) {
  console.error(
    "Mobile security audit failed (values suppressed):\n" + failures.join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Mobile source/config secret scan and foreground-only location policy: PASS",
  );
