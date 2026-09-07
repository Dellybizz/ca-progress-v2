import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { StudyTogetherInviteError, assertStudyTogetherInviteAllowed } from "@/lib/study-buddy/invite-guard";
import {
  StudyBuddyError,
  completeStudyTogether,
  contributeStudySessionToGoal,
  createSharedStudyGoal,
  getStudyBuddyDashboard,
  joinStudyTogether,
  removeStudyBuddy,
  reportStudyBuddy,
  requestStudyBuddy,
  respondStudyBuddy,
  sendStudyBuddyNudge,
  setStudyBuddySafety,
  startStudyTogether,
  updateStudyBuddySharing,
} from "@/lib/study-buddy/service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };
const ADVANCED_ACTIONS = new Set(["sharing", "nudge", "createGoal", "contributeGoal", "startTogether", "joinTogether", "completeTogether"]);

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to use Study Buddy." }, { status: 401, headers: privateHeaders });
  try {
    return NextResponse.json({ ok: true, dashboard: await getStudyBuddyDashboard(user.id) }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "Study Buddy could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Cross-site Study Buddy mutation rejected." }, { status: 403, headers: privateHeaders });
  }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to use Study Buddy." }, { status: 401, headers: privateHeaders });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid Study Buddy request." }, { status: 400, headers: privateHeaders });
  const action = typeof body.action === "string" ? body.action : "";
  if (ADVANCED_ACTIONS.has(action)) {
    const access = await getPlanFeatureAccessForUser(user.id, "expanded_study_buddy");
    if (!access.allowed) return NextResponse.json({ ok: false, error: access.upgradeMessage, code: "PLAN_UPGRADE_REQUIRED" }, { status: 403, headers: privateHeaders });
  }

  try {
    let result: unknown;
    switch (action) {
      case "request": result = await requestStudyBuddy(user.id, body.buddyUserId); break;
      case "respond": result = await respondStudyBuddy(user.id, body.buddyUserId, body.response); break;
      case "remove": result = await removeStudyBuddy(user.id, body.buddyUserId); break;
      case "sharing": result = await updateStudyBuddySharing(user.id, body.buddyUserId, body); break;
      case "nudge": result = await sendStudyBuddyNudge(user.id, body.buddyUserId, body.message); break;
      case "createGoal": result = await createSharedStudyGoal(user.id, body.buddyUserId, body); break;
      case "contributeGoal": result = await contributeStudySessionToGoal(user.id, body.goalId, body.studySessionId); break;
      case "startTogether": {
        await assertStudyTogetherInviteAllowed(user.id, body.buddyUserId);
        result = await startStudyTogether(user.id, body.buddyUserId);
        break;
      }
      case "joinTogether": result = await joinStudyTogether(user.id, body.studyTogetherId); break;
      case "completeTogether": result = await completeStudyTogether(user.id, body.studyTogetherId, body.studySessionId); break;
      case "safety": result = await setStudyBuddySafety(user.id, body.buddyUserId, body.mode); break;
      case "report": result = await reportStudyBuddy(user.id, body.buddyUserId, body.reason, body.details); break;
      default: throw new StudyBuddyError("Unsupported Study Buddy action.");
    }
    return NextResponse.json({ ok: true, result }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof StudyBuddyError || error instanceof StudyTogetherInviteError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: privateHeaders });
    }
    return NextResponse.json({ ok: false, error: "Study Buddy could not be updated." }, { status: 500, headers: privateHeaders });
  }
}
