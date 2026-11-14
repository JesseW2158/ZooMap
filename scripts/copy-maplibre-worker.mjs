// Copies MapLibre's web worker into public/ so the map can load it from a URL we control.
//
// MapLibre finds its worker with `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, which
// works only when the bundler leaves `import.meta.url` as an http(s) URL. Next/Turbopack rewrites
// it, so the map fails with "Worker failed to load". MapProvider calls `setWorkerUrl()` with the
// copy this script writes. Runs before `dev` and `build`; the output is gitignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const source = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
const target = "public/maplibre/maplibre-gl-worker.mjs";

if (!existsSync(source)) {
  console.error(`copy-maplibre-worker: ${source} not found. Run npm ci first.`);
  process.exit(1);
}
mkdirSync("public/maplibre", { recursive: true });
copyFileSync(source, target);
