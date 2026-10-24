// Builds the Zendesk app into apps/zendesk/assets (committed: Zendesk serves that folder).
//   1. src/worker.ts -> IIFE string
//   2. src/main.tsx  -> assets/app.js, with the worker source injected so the page can start the
//      worker from a Blob URL (a URL to an asset file would be cross-origin inside the ZAF iframe)
//   3. src/app.css   -> assets/app.css via the Tailwind v4 CLI
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const tsconfig = path.join(root, "tsconfig.json");

const common = {
  bundle: true,
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  tsconfig,
  // tsconfig says jsx: preserve (Next compiles it); here esbuild must compile JSX itself.
  jsx: "automatic",
  logLevel: "warning",
  // Next's "use client" directives are meaningless in this bundle.
  logOverride: { "unsupported-js-feature": "silent" },
};

const worker = await build({
  ...common,
  entryPoints: [path.join(here, "src/worker.ts")],
  format: "iife",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
});
const workerSource = worker.outputFiles[0].text;

await build({
  ...common,
  entryPoints: [path.join(here, "src/main.tsx")],
  outfile: path.join(here, "assets/app.js"),
  format: "iife",
  define: {
    "process.env.NODE_ENV": '"production"',
    __WORKER_SOURCE__: JSON.stringify(workerSource),
  },
});

const cliPkg = path.join(root, "node_modules/@tailwindcss/cli/package.json");
const bin = JSON.parse(readFileSync(cliPkg, "utf8")).bin;
const cliEntry = path.join(path.dirname(cliPkg), typeof bin === "string" ? bin : Object.values(bin)[0]);
execFileSync(
  process.execPath,
  [cliEntry, "-i", path.join(here, "src/app.css"), "-o", path.join(here, "assets/app.css"), "--minify"],
  { stdio: "inherit", cwd: here },
);

const kb = (f) => `${(statSync(path.join(here, f)).size / 1024).toFixed(0)} KB`;
console.log(`zendesk app built: assets/app.js ${kb("assets/app.js")}, assets/app.css ${kb("assets/app.css")} (worker ${(workerSource.length / 1024).toFixed(0)} KB inside app.js)`);
