import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
function collect(dir) { const out=[]; for (const entry of readdirSync(dir)) { const path=join(dir,entry); if (statSync(path).isDirectory()) { if (!["node_modules",".git"].includes(entry)) out.push(...collect(path)); } else if (/\.(ts|tsx|sql)$/.test(entry)) out.push(readFileSync(path,"utf8")); } return out; }
test("Phase 2 does not implement the Phase 3 syllabus engine", () => { const source=collect(root).join("\n"); for (const name of ["subjects_master","chapters_master","syllabus_version_id","academic_subjects","chapter_dependencies"]) assert.equal(source.includes(name), false, name); });
test("Phase 2 keeps auth request-scoped instead of adding a giant AuthContext", () => { const source=collect(root).join("\n"); assert.equal(/createContext\([^)]*auth/i.test(source), false); assert.match(readFileSync(join(root,"lib/auth/server.ts"),"utf8"), /optionalUser/); assert.match(readFileSync(join(root,"lib/auth/server.ts"),"utf8"), /requireUser/); });
