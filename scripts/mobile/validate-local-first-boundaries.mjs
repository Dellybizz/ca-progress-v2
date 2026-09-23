import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mobileLocalFirstBoundaries as policy } from "../../config/mobile-local-first-boundaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function filesBelow(directory) {
  try {
    if (!(await stat(directory)).isDirectory()) return [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(target));
    else if (policy.extensions.includes(path.extname(entry.name))) output.push(target);
  }
  return output;
}

export function violationsForSource(source, relativePath = "fixture.ts") {
  const violations = [];
  const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|require\s*\(|import\s*\()\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const forbidden = policy.forbiddenImports.find((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`));
    if (forbidden) violations.push(`${relativePath}: forbidden import '${specifier}'`);
  }
  for (const item of policy.forbiddenPatterns) {
    if (new RegExp(item.source).test(source)) violations.push(`${relativePath}: forbidden ${item.name}`);
  }
  return violations;
}

export async function validateMobileBoundaries(repositoryRoot = root) {
  const files = (await Promise.all(policy.sourceRoots.map((item) => filesBelow(path.join(repositoryRoot, item))))).flat();
  const violations = [];
  for (const file of files) {
    violations.push(...violationsForSource(await readFile(file, "utf8"), path.relative(repositoryRoot, file)));
  }
  return { filesChecked: files.length, configuredRoots: policy.sourceRoots.length, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await validateMobileBoundaries();
  if (result.violations.length) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Mobile boundary check passed (${result.filesChecked} files, ${result.configuredRoots} roots).`);
  }
}
