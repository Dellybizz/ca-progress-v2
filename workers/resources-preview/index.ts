import {processResource} from '../../lib/resources/processing';
import type {HotD1Database} from '../../lib/data/d1/runtime';
import type {ResourceR2Bucket} from '../../lib/resources/r2';
const worker={async fetch(request:Request,env:{DB:HotD1Database;USER_RESOURCES_R2:ResourceR2Bucket}){
 if(request.method!=='POST')return new Response('Not found',{status:404});const body=await request.json().catch(()=>null) as {resourceId?:string;owner?:string}|null;
 if(!body?.resourceId||!body.owner)return Response.json({error:'Invalid job.'},{status:400});
 try{return Response.json(await processResource(body.resourceId,body.owner,env.DB,env.USER_RESOURCES_R2));}catch{return Response.json({error:'Processing will retry.'},{status:503});}
}};

export default worker;
