import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { optionalUser } from "@/lib/auth/server";
import { revokeStudyProfileBuddy, StudyProfileInputError } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };

export async function POST(request: NextRequest) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ok:false,error:"Cross-site profile request rejected."},{status:403,headers:privateHeaders}); }
  const user=await optionalUser();
  if(!user) return NextResponse.json({ok:false,error:"Sign in to manage Study Buddies."},{status:401,headers:privateHeaders});
  return NextResponse.json({ok:false,error:"Study Buddy access now requires a request and acceptance. Use the Study Buddy page."},{status:409,headers:privateHeaders});
}

export async function DELETE(request: NextRequest) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ok:false,error:"Cross-site profile request rejected."},{status:403,headers:privateHeaders}); }
  const user=await optionalUser();
  if(!user) return NextResponse.json({ok:false,error:"Sign in to manage Study Buddies."},{status:401,headers:privateHeaders});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  try { const settings=await revokeStudyProfileBuddy(user.id,body?.buddyUserId); return NextResponse.json({ok:true,settings},{headers:privateHeaders}); }
  catch(error){if(error instanceof StudyProfileInputError)return NextResponse.json({ok:false,error:error.message},{status:400,headers:privateHeaders});return NextResponse.json({ok:false,error:"Could not remove legacy buddy access."},{status:500,headers:privateHeaders});}
}
