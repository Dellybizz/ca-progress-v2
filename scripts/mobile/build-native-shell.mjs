import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import { build } from "esbuild";

const root = process.cwd();
const source = path.join(root, "apps/mobile");
const output = path.join(root, "native-shell");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await cp(path.join(source, "index.html"), path.join(output, "index.html"));
// Account screens now use bundled onboarding illustrations.
await cp(path.join(root,"public/onboarding"),path.join(output,"assets/onboarding"),{recursive:true});
const manifest=[];
for(const name of ['stationery.svg','book.svg']){const bytes=await readFile(path.join(output,'assets/onboarding',name));manifest.push({path:`assets/onboarding/${name}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(path.join(output,'assets/onboarding/manifest.json'),JSON.stringify({version:1,assets:manifest,fonts:'System font stack; no remote font requests.',catalog:'First-run verified catalog is empty; refreshed choices are cached per account.'},null,2));
await build({
  entryPoints: [path.join(source, "src/main.tsx")],
  outfile: path.join(output, "assets/app.js"),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: ["chrome120", "safari17"],
  jsx: "automatic",
  define: { __CA_EMULATOR_FIXTURE__: process.env.CA_MOBILE_EMULATOR_FIXTURE === "1" ? "true" : "false" },
  legalComments: "none",
  loader: { ".css": "css" },
});
console.log("Bundled native shell created in native-shell/.");
