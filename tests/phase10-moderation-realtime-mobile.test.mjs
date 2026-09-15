import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(path)=>readFileSync(join(root,path),"utf8");

test("Realtime scopes refreshes to the active channel and cleans up the Cloudflare-compatible adapter",()=>{const chat=read("components/community/community-chat.tsx");const provider=read("lib/community/realtime-provider.ts");assert.match(chat,/subscribeToCommunityRealtime/);assert.match(chat,/channelId:\s*model\.channel\.id/);assert.match(chat,/onDataChanged:\s*scheduleRefresh/);assert.match(chat,/unsubscribe\(\)/);assert.match(provider,/window\.setInterval\(refreshData, DATA_REFRESH_MS\)/);assert.match(provider,/window\.clearInterval\(fallbackDataTimer\)/);assert.doesNotMatch(chat,/supabase\.removeChannel|\.channel\(`community:/);});
test("mobile Community chat owns the dynamic viewport",()=>{const css=read("app/styles/phase10.css");assert.match(css,/@media\(max-width:720px\)/);assert.match(css,/height:calc\(100dvh/);assert.match(css,/overflow:hidden/);assert.match(css,/phase10-message-scroll[\s\S]*overflow-y:auto/);assert.match(css,/env\(safe-area-inset-bottom\)/);});
test("Community product and moderation routes have loading and error boundaries",()=>{for(const path of ["app/(student)/community/loading.tsx","app/(student)/community/error.tsx","app/(student)/community/[channel]/loading.tsx","app/(student)/community/[channel]/error.tsx","app/(admin)/admin/community/moderation/loading.tsx","app/(admin)/admin/community/moderation/error.tsx"]) assert.ok(read(path).length>0,path);});
