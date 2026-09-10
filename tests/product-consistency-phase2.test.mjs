import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const context=read("lib/academic/student-context.ts");

test("Phase 2 has one request-scoped canonical student context",()=>{
  assert.match(context,/export const getStudentContext = cache\(resolveStudentContextUncached\)/);
  assert.match(context,/getRequestAuthContext\(\)/);
  assert.match(context,/getProfileForUser\(auth\.identity\.id\)/);
  assert.match(read("app/(student)/layout.tsx"),/StudentContextProvider value=\{context\}/);
});

test("canonical context rejects impossible and unmapped selections",()=>{
  assert.match(context,/level === "foundation" && input\.group !== "not_applicable"/);
  assert.match(context,/level !== "foundation" && input\.group === "not_applicable"/);
  assert.match(context,/JOIN attempt_syllabus_map/);
  assert.match(context,/if \(!scope\) return \{ ok: false/);
});

test("context scope is constrained by level, group and attempt",()=>{
  assert.match(context,/asm\.attempt_key=\?1/);
  assert.match(context,/l\.code=\?2/);
  assert.match(context,/g\.code=\?3/);
  for(const field of ["levelId","groupIds","subjectIds","syllabusVersionIds","contextKey"])
    assert.match(context,new RegExp(field));
});

test("profile and onboarding changes validate canonical scope and invalidate dependent data",()=>{
  for(const path of ["app/api/profile/route.ts","app/api/onboarding/route.ts"]){
    const source=read(path);
    assert.match(source,/validateAcademicContextSelection/);
    assert.match(source,/invalidateUserFeatureCache\(user\.id\)/);
    assert.match(source,/revalidatePath\("\/", "layout"\)/);
  }
  const validation=read("lib/profile/validation.ts");
  const form=read("components/auth/profile-form.tsx");
  assert.match(validation,/attemptAppliesToSelection/);
  assert.match(form,/attemptAppliesToSelection\(option, level, effectiveGroup\)/);
});

test("admin previews are authorized, explicit and non-persistent",()=>{
  assert.match(context,/requireAdminCapability\("academic\.read"\)/);
  assert.match(context,/mode: "admin_preview"/);
  const route=read("app/api/admin/academic/preview-context/route.ts");
  assert.match(route,/getAdminPreviewContext/);
  assert.doesNotMatch(route,/saveProfilePatch|UPDATE|INSERT|DELETE/);
});

test("client context contract is shared without client-side authority",()=>{
  const provider=read("components/academic/student-context-provider.tsx");
  assert.match(provider,/createContext<StudentContextContract/);
  assert.match(provider,/useStudentContext/);
  assert.doesNotMatch(provider,/fetch\(|localStorage|sessionStorage/);
  assert.match(context,/academicFeatureCacheKey/);
});
