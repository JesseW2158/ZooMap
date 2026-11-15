import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture rules (see CLAUDE.md "Architecture"). They are errors, so `npm run check` fails on them.
 *  1. A module is imported only through its index: `@/modules/<name>`, never `@/modules/<name>/x`.
 *     Inside a module use relative imports. Exempt: the registry, the subscriber list, scripts.
 *  2. Client code (module `ui/`, the shell, shared client seams) must not reach the server:
 *     no mongodb, no `@/shared/db`, no server env, no module index. `import type` is fine.
 *  3. `src/shared` must not import modules or the app (except the subscriber list).
 */
const DEEP_MODULE_IMPORT = {
  group: ["@/modules/*/*"],
  message: "Import a module only through its index.ts (`@/modules/<name>`). Inside your own module use relative imports.",
};

const SERVER_ONLY = [
  { group: ["mongodb", "mongodb/*"], allowTypeImports: true, message: "Client code must not import the database driver." },
  { group: ["@/shared/db", "@/shared/db/*"], allowTypeImports: true, message: "Client code must not import the database layer." },
  { group: ["@/shared/config/env"], allowTypeImports: true, message: "Use `@/shared/config/public-env` in client code." },
  { group: ["@/modules/*"], allowTypeImports: true, message: "Client code talks to modules over /api, not by importing their server code." },
  { group: ["next-auth", "next-auth/*", "@auth/*"], allowTypeImports: true, message: "Auth is server-side." },
];

const NO_UPWARD = [
  { group: ["@/modules/*", "@/app/*"], message: "src/shared must not depend on modules or the app." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "android/**", "data/**", "coverage/**", ".remember/**", ".10x/**", "public/maplibre/**"]),

  {
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_MODULE_IMPORT] }],
    },
  },
  {
    // Modules, the shell, shared client seams: browser code.
    files: [
      "src/modules/*/ui/**/*.{ts,tsx}",
      "src/app/_shell/**/*.{ts,tsx}",
      "src/shared/ui/**/*.{ts,tsx}",
      "src/shared/platform/**/*.{ts,tsx}",
    ],
    ignores: ["src/app/_shell/actions.ts"], // a "use server" file
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_MODULE_IMPORT, ...SERVER_ONLY] }],
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    ignores: ["src/shared/events/subscribers.ts", "src/shared/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_MODULE_IMPORT, ...NO_UPWARD] }],
    },
  },
  {
    // The shared UI and platform seams are also client code: keep the shared rule and the client rule.
    files: ["src/shared/ui/**/*.{ts,tsx}", "src/shared/platform/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_MODULE_IMPORT, ...NO_UPWARD, ...SERVER_ONLY] }],
    },
  },
  {
    // The only files allowed to import module internals.
    files: ["src/app/registry.ts", "src/shared/events/subscribers.ts", "scripts/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;
