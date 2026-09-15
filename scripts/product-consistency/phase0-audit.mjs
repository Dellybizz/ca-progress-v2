import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { routeContracts, personaContracts } from "../../config/product-consistency-route-contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function walkPages(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walkPages(path, files);
    else if (entry.name === "page.tsx") files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const actualPages = [...walkPages(join(root, "app/(student)")), ...walkPages(join(root, "app/(admin)"))].sort();
const mappedPages = new Set(routeContracts.map((item) => item.page));
const missingContracts = actualPages.filter((page) => !mappedPages.has(page));
const staleContracts = routeContracts.filter((item) => !existsSync(join(root, item.page))).map((item) => item.page);
const duplicateRoutes = routeContracts.map((item) => item.route).filter((route, index, all) => all.indexOf(route) !== index);
const partial = routeContracts.filter((item) => item.enforcement === "partial");

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "Product Consistency Programme Phase 0",
  summary: {
    actualPages: actualPages.length,
    contractedPages: routeContracts.length,
    canonicalRoutes: routeContracts.length - partial.length,
    partialRoutes: partial.length,
    missingContracts: missingContracts.length,
    staleContracts: staleContracts.length,
    duplicateRoutes: duplicateRoutes.length,
    personas: personaContracts.length,
  },
  safety: {
    mutatesDatabase: false,
    productionBackupVerified: false,
    productionBackupReason: "Only the separate credentialed workflow may certify a production backup.",
  },
  missingContracts,
  staleContracts,
  duplicateRoutes,
  knownGaps: partial.map(({ route, knownGap }) => ({ route, finding: knownGap })),
  personas: personaContracts,
};

if (missingContracts.length || staleContracts.length || duplicateRoutes.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  const output = option("--output");
  if (output) {
    const absolute = resolve(root, output);
    if (!existsSync(dirname(absolute)) || !statSync(dirname(absolute)).isDirectory()) throw new Error("Output directory does not exist.");
    writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (!process.argv.includes("--quiet")) console.log(JSON.stringify(report, null, 2));
}

