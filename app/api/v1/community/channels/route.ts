import {NextResponse,type NextRequest} from "next/server";
import {getPhase7CommunityHomeModel} from "@/lib/community/phase7";
import {MOBILE_API_HEADERS} from "@/lib/mobile/contract";
import {nativeCorsHeaders,nativeOptions} from "@/lib/auth/native-cors";
export const dynamic="force-dynamic";
const json=(request:NextRequest,data:unknown,status=200)=>NextResponse.json(data,{status,headers:{...MOBILE_API_HEADERS,...nativeCorsHeaders(request),"Cache-Control":"private, no-store"}});
export const OPTIONS=(request:NextRequest)=>nativeOptions(request);
export async function GET(request:NextRequest){try{const model=await getPhase7CommunityHomeModel();if(model.mode!=="ready")return json(request,{error:{code:"AUTH_REQUIRED",message:"Sign in to synchronize Community.",retryable:false}},401);return json(request,{schema:1,channels:model.groups.flatMap(group=>group.channels).map(channel=>({key:channel.slug,title:channel.title,latestSequence:channel.latestSequence,latestBody:channel.latestBody,latestAt:channel.latestAt,unreadCount:channel.unreadCount,canWrite:channel.canWrite}))});}catch(error){return json(request,{error:{code:"COMMUNITY_UNAVAILABLE",message:error instanceof Error?error.message:"Community is unavailable.",retryable:true}},409);}}
