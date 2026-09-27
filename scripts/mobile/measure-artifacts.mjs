import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = ["native-shell/index.html", "native-shell/assets/app.js", "native-shell/assets/app.css"];
const report = { measuredAt: new Date().toISOString(), files: [], totalBundleBytes: 0, androidApk: null };
for (const name of targets) {
  const bytes = await readFile(path.join(root, name));
  report.files.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  report.totalBundleBytes += bytes.length;
}
const apk = process.argv[2];
if (apk) {
  const details = await stat(apk);
  report.androidApk = { path: path.resolve(apk), bytes: details.size };
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
