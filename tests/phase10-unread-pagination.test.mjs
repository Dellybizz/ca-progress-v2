import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(p)=>readFileSync(join(root,p),"utf8");

test("older messages use stable sequence cursor pagination instead of full history",()=>{const service=read("lib/community/service.ts");const client=read("components/community/community-chat.tsx");assert.match(service,/const PAGE_SIZE = 30/);assert.match(service,/getHotCommunityMessages/);assert.match(service,/raw\.length > PAGE_SIZE/);assert.match(service,/raw\.slice\(0, PAGE_SIZE\)/);assert.match(service,/nextCursor/);assert.match(client,/Load older messages/);});
