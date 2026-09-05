import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("auth remains request-scoped instead of adding a giant AuthContext", () => {
  const authSource = ["lib/auth/server.ts", "lib/auth/provider.ts", "lib/auth/proxy.ts"].map(read).join("\n");
  assert.equal(/createContext\([^)]*auth/i.test(authSource), false);
  assert.match(read("lib/auth/server.ts"), /optionalUser/);
  assert.match(read("lib/auth/server.ts"), /requireUser/);
  assert.doesNotMatch(authSource, /@supabase\/|lib\/supabase/);
});
