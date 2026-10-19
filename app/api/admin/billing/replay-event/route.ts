import {NextResponse} from 'next/server';
import {adminAuthorizationStatus,requireAdminCapability} from '@/lib/authorization/server';
import {invokeBillingService} from '@/lib/billing/service-binding';
import {readWebhookBytes} from '@/lib/billing/webhook-body.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 let actor;try{actor=await requireAdminCapability('billing.manage');}catch(error){return NextResponse.json({error:'Billing authority is required.'},{status:adminAuthorizationStatus(error)??403,headers:{'cache-control':'private, no-store'}});}
 let body:ArrayBuffer;try{body=await readWebhookBytes(request,4096);}catch{return NextResponse.json({error:'Replay request is too large.'},{status:413});}
 return invokeBillingService({path:'/admin/replay-event',body,contentType:'application/json',userId:actor.user.id,actorRole:actor.role});
}
