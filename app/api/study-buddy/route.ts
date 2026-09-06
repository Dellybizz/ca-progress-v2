import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { optionalUser } from "@/lib/auth/server";
import {
  StudyBuddyConflictError, StudyBuddyForbiddenError, StudyBuddyInputError, StudyBuddyRateLimitError,
  addStudyBuddyGoalContribution, blockStudyBuddy, cancelStudyTogether, completeStudyTogether,
  createStudyBuddyWeeklyGoal, getStudyBuddyDashboard, inviteStudyTogether, removeStudyBuddy,
  reportStudyBuddy, requestStudyBuddy, respondStudyBuddyRequest, respondStudyTogether,
  saveStudyBuddySharing, sendStudyBuddyNudge, setStudyBuddyMute, unblockStudyBuddy, updateStudyBuddyNudge,
} from "@/lib/study-buddy/service";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok:false,error:"Sign in to use Study Buddy." },{status:401,headers});
  return NextResponse.json({ ok:true,dashboard:await getStudyBuddyDashboard(user.id) },{headers});
}

export async function POST(request:NextRequest) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ok:false,error:"Cross-site Study Buddy request rejected."},{status:403,headers}); }
  const user=await optionalUser();
  if(!user) return NextResponse.json({ok:false,error:"Sign in to use Study Buddy."},{status:401,headers});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body||typeof body.action!=="string") return NextResponse.json({ok:false,error:"Invalid Study Buddy request."},{status:400,headers});
  try {
    let result:unknown;
    switch(body.action){
      case "request": result=await requestStudyBuddy(user.id,body.targetUserId); break;
      case "respond-request": result=await respondStudyBuddyRequest(user.id,body.relationshipId,body.decision); break;
      case "remove": result=await removeStudyBuddy(user.id,body.relationshipId); break;
      case "sharing": result=await saveStudyBuddySharing(user.id,body.relationshipId,body); break;
      case "nudge": result=await sendStudyBuddyNudge(user.id,body.relationshipId,body.kind); break;
      case "nudge-status": result=await updateStudyBuddyNudge(user.id,body.nudgeId,body.status); break;
      case "weekly-goal": result=await createStudyBuddyWeeklyGoal(user.id,body.relationshipId,body); break;
      case "goal-contribution": result=await addStudyBuddyGoalContribution(user.id,body.goalId,body); break;
      case "study-together-invite": result=await inviteStudyTogether(user.id,body.relationshipId,body); break;
      case "study-together-respond": result=await respondStudyTogether(user.id,body.sessionId,body.decision); break;
      case "study-together-cancel": result=await cancelStudyTogether(user.id,body.sessionId); break;
      case "study-together-complete": result=await completeStudyTogether(user.id,body.sessionId,body.minutes); break;
      case "mute": result=await setStudyBuddyMute(user.id,body.targetUserId,body); break;
      case "block": result=await blockStudyBuddy(user.id,body.targetUserId); break;
      case "unblock": result=await unblockStudyBuddy(user.id,body.targetUserId); break;
      case "report": result=await reportStudyBuddy(user.id,body.targetUserId,body); break;
      default: throw new StudyBuddyInputError("Unknown Study Buddy action.");
    }
    return NextResponse.json({ok:true,result,dashboard:await getStudyBuddyDashboard(user.id)},{headers});
  } catch(error) {
    if(error instanceof StudyBuddyRateLimitError) return NextResponse.json({ok:false,error:error.message},{status:429,headers});
    if(error instanceof StudyBuddyConflictError) return NextResponse.json({ok:false,error:error.message},{status:409,headers});
    if(error instanceof StudyBuddyForbiddenError) return NextResponse.json({ok:false,error:error.message},{status:403,headers});
    if(error instanceof StudyBuddyInputError) return NextResponse.json({ok:false,error:error.message},{status:400,headers});
    console.error("Study Buddy mutation failed",error);
    return NextResponse.json({ok:false,error:"Could not update Study Buddy."},{status:500,headers});
  }
}
