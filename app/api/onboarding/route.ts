import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { optionalUser, loadAttemptOptions, getProfileForUser } from "@/lib/auth/server";
import { saveOnboardingPreparationState } from "@/lib/profile/onboarding-experience";
import { saveProfilePatch, type ProfilePatch } from "@/lib/profile/service";
import { attemptAppliesToLevel, isCALevel, isGroupChoice, isPreparationState, validateOnboardingSelection } from "@/lib/profile/validation";
import { validateAcademicContextSelection } from "@/lib/academic/student-context";
import { invalidateUserFeatureCache } from "@/lib/cache/public";

import {assertSameOriginMutation} from '@/lib/auth/csrf';
import {getSetupState} from '@/lib/profile/setup-state';
import {persistSetup,SetupError} from '@/lib/profile/setup-service';
import {resumeLegacySetup,reconcileSavedSetup} from '@/lib/profile/setup-contract';
import {getOnboardingPreparationState} from '@/lib/profile/onboarding-experience';
import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';

export const dynamic = "force-dynamic";

export const OPTIONS=(request:Request)=>nativeOptions(request);
export async function GET(request:Request){
 const headers={...nativeCorsHeaders(request),'Cache-Control':'private, no-store'},user=await optionalUser();
 if(!user)return NextResponse.json({ok:false,error:'Sign in to read setup.'},{status:401,headers});
 const profile=await getProfileForUser(user.id);if(!profile)return NextResponse.json({ok:false,error:'Your profile could not load.'},{status:503,headers});
 const saved=await getSetupState(user.id),completed=Boolean(profile.onboarding_completed_at);
 if(completed)return NextResponse.json({ok:true,ownerId:user.id,completed:true,state:saved,attempts:[],existingGoal:profile.daily_target_minutes},{headers});
 const [attempts,preparation_state]=await Promise.all([loadAttemptOptions(),getOnboardingPreparationState(user.id)]);
 const state=saved?{...saved,draft:reconcileSavedSetup(saved.draft,attempts)}:{draft:resumeLegacySetup({...profile,preparation_state},attempts),revision:0};
 return NextResponse.json({ok:true,ownerId:user.id,completed:false,state,attempts,existingGoal:profile.daily_target_minutes},{headers});
}

export async function POST(request: Request) {
  if(!request.headers.get('authorization')?.startsWith('Bearer ')){try{assertSameOriginMutation(request);}catch{return NextResponse.json({ok:false,error:'Invalid request origin.'},{status:403});}}
  if(Number(request.headers.get('content-length')||0)>8192)return NextResponse.json({ok:false,error:'Setup request is too large.'},{status:413});
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to save onboarding." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "draft" && body.action !== "complete")) return NextResponse.json({ ok: false, error: "Invalid onboarding request." }, { status: 400 });
  const currentProfile=await getProfileForUser(user.id);
  if(body.schemaVersion!==undefined){
    if(body.schemaVersion!==2)return NextResponse.json({ok:false,error:'Unsupported setup version.'},{status:400});
    if(body.ownerId!==user.id)return NextResponse.json({ok:false,error:'Your signed-in account changed. Reload before saving setup.'},{status:409});
    if(currentProfile?.onboarding_completed_at)return NextResponse.json({ok:true,alreadyCompleted:true},{headers:{'Cache-Control':'private, no-store'}});
    const attempts=await loadAttemptOptions();
    try{const result=await persistSetup(user.id,body.draft,body.revision,body.action==='complete',attempts);
      if(body.action==='complete'){await invalidateUserFeatureCache(user.id);revalidatePath('/', 'layout');}
      return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
    }catch(error){return NextResponse.json({ok:false,error:error instanceof SetupError?error.message:'Could not save setup right now.'},{status:error instanceof SetupError?error.status:500,headers:{'Cache-Control':'private, no-store'}});}
  }
  // Retried legacy clients cannot reset an already completed account.
  if(currentProfile?.onboarding_completed_at)return NextResponse.json({ok:true,alreadyCompleted:true},{headers:{'Cache-Control':'private, no-store'}});
  const attempts=await loadAttemptOptions();
  const update: ProfilePatch = {};

  try {
    if (body.action === "complete") {
      const selection = validateOnboardingSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, preparationState: body.preparationState }, attempts);
      if (!selection.ok) return NextResponse.json({ ok: false, error: selection.error }, { status: 400 });
      const canonical = await validateAcademicContextSelection(selection.value);
      if (!canonical.ok) return NextResponse.json({ ok: false, error: canonical.error }, { status: 400 });
      await saveOnboardingPreparationState(user.id, selection.value.preparationState);
      update.caLevel = selection.value.level;
      update.groupChoice = selection.value.group;
      update.attemptKey = selection.value.attemptKey;
      update.onboardingStep = 4;
      update.onboardingCompletedAt = new Date().toISOString();
    } else {
      if (body.level !== null && body.level !== undefined) {
        if (!isCALevel(body.level)) return NextResponse.json({ ok: false, error: "Choose a valid CA level." }, { status: 400 });
        update.caLevel = body.level;
        if (body.level === "foundation") update.groupChoice = "not_applicable";
      }
      if (body.group !== null && body.group !== undefined && body.level !== "foundation") {
        if (!isGroupChoice(body.group) || body.group === "not_applicable") return NextResponse.json({ ok: false, error: "Choose a valid group." }, { status: 400 });
        update.groupChoice = body.group;
      }
      if (body.attemptKey !== null && body.attemptKey !== undefined) {
        const level = isCALevel(body.level) ? body.level : null;
        if (typeof body.attemptKey !== "string" || !attempts.some((option) => option.key === body.attemptKey && (!level || attemptAppliesToLevel(option, level)))) return NextResponse.json({ ok: false, error: "Choose an available attempt." }, { status: 400 });
        update.attemptKey = body.attemptKey;
      }
      if (body.preparationState !== null && body.preparationState !== undefined) {
        if (!isPreparationState(body.preparationState)) return NextResponse.json({ ok: false, error: "Choose your current preparation state." }, { status: 400 });
        await saveOnboardingPreparationState(user.id, body.preparationState);
      }
      const step = Number(body.step);
      update.onboardingStep = Number.isInteger(step) ? Math.min(4, Math.max(1, step)) : 1;
    }

    const profile = await saveProfilePatch(user.id, update);
    await invalidateUserFeatureCache(user.id);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save onboarding right now." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
