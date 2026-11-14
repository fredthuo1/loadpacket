import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const ts = require("typescript-eslint");
const globals = require("globals");
export default ts.config(...ts.configs.recommended, {
  files: ["**/*.mts"],
  languageOptions: { globals: globals.node },
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
});
