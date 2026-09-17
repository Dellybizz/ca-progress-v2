import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("fresh Cloudflare checkout preserves the OpenNext assets bootstrap directory before Wrangler validation",()=>{
  const wrangler=read("wrangler.jsonc");
  const ensure=read("scripts/ensure-opennext-build.mjs");
  const ignore=read(".gitignore");

  assert.match(wrangler,/"build": \{ "command": "npm run cf:ensure-build" \}/);
  assert.match(wrangler,/"assets": \{ "binding": "ASSETS", "directory": "\.open-next\/assets" \}/);
  assert.match(ensure,/OpenNext output is missing or stale; building before Wrangler deploy/);
  assert.match(ignore,/!\.open-next\/assets\//);
  assert.match(ignore,/!\.open-next\/assets\/\.gitkeep/);
  assert.equal(existsSync(new URL("../.open-next/assets/.gitkeep",import.meta.url)),true);
});
