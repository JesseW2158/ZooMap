import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Secrets live in .env.local (gitignored). Real environment variables win over the file.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const alias = { "@": path.resolve(import.meta.dirname, "src") };
const skipDb = process.env.SKIP_DB_TESTS === "1";

/**
 * Two projects:
 *  - unit: everything except `*.db.test.ts`; runs in parallel.
 *  - db:   `*.db.test.ts`; needs MONGODB_URI, runs one file at a time against `${MONGODB_DB}_test`.
 *          SKIP_DB_TESTS=1 leaves it out (and says so loudly in CLAUDE.md: it is not a pass).
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      ...(skipDb
        ? []
        : [
            {
              resolve: { alias },
              test: {
                name: "db",
                environment: "node",
                include: ["src/**/*.db.test.ts"],
                fileParallelism: false,
                testTimeout: 30_000,
                hookTimeout: 60_000,
              },
            },
          ]),
    ],
  },
});
