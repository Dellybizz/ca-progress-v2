import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUILD_ROOT = ".open-next";
const sourceRoots = ["app", "components", "lib"];
const ogSourcePattern = /(?:from\s+["']next\/og["']|import\s*\(\s*["']next\/og["']\s*\)|\bImageResponse\b)/;
const emittedOgPatterns = [
  /import\(\s*["']next\/dist\/compiled\/@vercel\/og\/index\.edge\.js["']\s*\)/g,
  /import\(\s*["']next\/dist\/compiled\/@vercel\/og\/index\.node\.js["']\s*\)/g,
];

// The generated Next runtime may evaluate its lazy-import expression while
// bootstrapping ordinary SSR routes even when the application never requests
// OG image generation. Replacing it with Promise.reject() therefore risks an
// unhandled rejection and a Worker-level 500. Resolve an inert module instead:
// the heavy @vercel/og code is still excluded from Wrangler's bundle, while
// unrelated routes remain safe to execute. The source guard below ensures we
// fail the build before doing this if CA Progress ever starts using next/og.
const replacement = "Promise.resolve(Object.freeze({}))";

async function filesUnder(directory, allowedExtensions = null) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, allowedExtensions));
    else if (!allowedExtensions || allowedExtensions.some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

async function assertAppDoesNotUseOg() {
  const sourceFiles = [];
  for (const root of sourceRoots) sourceFiles.push(...await filesUnder(root, [".ts", ".tsx", ".js", ".jsx", ".mjs"]));
  for (const path of sourceFiles) {
    const source = await readFile(path, "utf8");
    if (ogSourcePattern.test(source)) {
      throw new Error(`Refusing to strip @vercel/og because application source uses OG image generation: ${path}`);
    }
  }
}

async function patchBuild() {
  await assertAppDoesNotUseOg();
  const rootStat = await stat(BUILD_ROOT).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`${BUILD_ROOT} was not produced. Run the OpenNext build before this patch.`);

  const emittedFiles = await filesUnder(BUILD_ROOT, [".mjs", ".js"]);
  let replacements = 0;
  const patchedFiles = [];
  for (const path of emittedFiles) {
    let source = await readFile(path, "utf8");
    const original = source;
    for (const pattern of emittedOgPatterns) {
      source = source.replace(pattern, () => {
        replacements += 1;
        return replacement;
      });
    }
    if (source !== original) {
      await writeFile(path, source, "utf8");
      patchedFiles.push(path);
    }
  }

  if (replacements === 0) {
    console.log("[cloudflare-size] No emitted @vercel/og dynamic import found; no patch was necessary.");
    return;
  }
  console.log(`[cloudflare-size] Removed ${replacements} unused @vercel/og import(s) from ${patchedFiles.length} OpenNext file(s).`);
  for (const path of patchedFiles) console.log(`[cloudflare-size] patched ${path}`);
}

await patchBuild();
