import {optionalUser} from '@/lib/auth/server';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
import {ownedAccountDataStream} from '@/lib/exports/account-data.mjs';
export const dynamic='force-dynamic';
export const OPTIONS=(request:Request)=>nativeOptions(request);
export async function GET(request:Request){
 const headers={...nativeCorsHeaders(request),'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'};
 const user=await optionalUser();
 if(!user)return Response.json({error:'Sign in to export your saved data.'},{status:401,headers});
 return new Response(ownedAccountDataStream(getHotD1Database(),user.id),{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="ca-progress-account-data.jsonl"'}});
}
