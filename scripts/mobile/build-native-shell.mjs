import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const source = path.join(root, "apps/mobile");
const output = path.join(root, "native-shell");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await cp(path.join(source, "index.html"), path.join(output, "index.html"));
await build({
  entryPoints: [path.join(source, "src/main.tsx")],
  outfile: path.join(output, "assets/app.js"),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: ["chrome120", "safari17"],
  jsx: "automatic",
  legalComments: "none",
  loader: { ".css": "css" },
});
console.log("Bundled native shell created in native-shell/.");
