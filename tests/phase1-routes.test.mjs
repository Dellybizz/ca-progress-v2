import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname; const read = (p) => readFileSync(join(root, p), "utf8"); const studentRoutes = ["dashboard", "planner", "progress", "study", "tests", "notes", "resources", "community", "settings"];
test("all Phase 1 major routes render V2 previews", () => { for (const route of studentRoutes) { const file = `app/(student)/${route}/page.tsx`; assert.equal(existsSync(join(root, file)), true, route); assert.equal(read(file).includes("PlaceholderPage"), false, `${route} must not use Phase 0 placeholder UI`); } assert.equal(existsSync(join(root, "app/(admin)/admin/page.tsx")), true); });
test("route groups own loading and error boundaries", () => { for (const group of ["student", "admin", "public"]) { assert.equal(existsSync(join(root, `app/(${group})/loading.tsx`)), true, `${group} loading`); assert.equal(existsSync(join(root, `app/(${group})/error.tsx`)), true, `${group} error`); } });
test("mobile navigation is independently designed with real routes", () => { const mobile = read("components/shell/mobile-nav-placeholder.tsx"); assert.match(mobile, /BottomSheet/); assert.match(mobile, /\/planner/); assert.match(mobile, /\/progress/); assert.match(mobile, /\/study/); assert.equal(mobile.includes('href="#"'), false); });
test("every mock feature surface includes an explicit zero-data state", () => { const dashboard = read("components/mock/dashboard-preview.tsx"); const product = read("components/mock/product-preview.tsx"); assert.match(dashboard, /EmptyState/); assert.match(product, /EmptyState/); assert.match(product, /No persistent feature data in Phase 1/); });
