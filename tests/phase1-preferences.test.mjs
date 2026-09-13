import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname; const read = (p) => readFileSync(join(root, p), "utf8");

test("UI preference contract is provider-neutral and represented in current database types", () => {
  const contract = read("lib/preferences/contract.ts");
  for (const value of ["system", "light", "dark", "indigo", "violet", "emerald", "rose", "comfortable", "compact"]) assert.match(contract, new RegExp(`"${value}"`));
  assert.match(read("lib/data/database.types.ts"), /user_preferences/);
  assert.doesNotMatch(contract, /supabase/i);
});
