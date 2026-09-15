import { getIcaiSyncConfig } from "@/lib/env";
import { runConsistencyScan } from "@/lib/consistency/scanner";
export const dynamic="force-dynamic";
export async function POST(request:Request){const secret=getIcaiSyncConfig().cronSecret;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401});const result=await runConsistencyScan({trigger:"scheduled"});return Response.json({ok:true,...result});}
