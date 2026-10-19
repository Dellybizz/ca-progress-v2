import {emptySetupDraft,reconcileSavedSetup,setupReadiness,validateSetupDraft,SetupRequestError,type SetupDraft} from './setup-contract';
import type {SetupBootstrap} from './setup-bootstrap';
import type {AttemptOption} from './validation';

export type LocalSetup = {version:1;scope:string;localVersion:number;writeId:string;draft:SetupDraft;serverRevision:number|null;baseline:SetupDraft|null;pending:'draft'|'complete'|null;completed:boolean;checked:boolean;reviewing:boolean;attempts:AttemptOption[];existingGoal:number|null;conflict:SetupBootstrap|null;retainedDraft:SetupDraft|null;lastSent:{draft:SetupDraft;revision:number;action:'draft'|'complete'}|null};
export interface SetupStore {read(scope:string):Promise<LocalSetup|null>;cas(scope:string,expected:number,value:LocalSetup):Promise<boolean>;remove(scope:string):Promise<void>;handoff(source:LocalSetup,expected:number,value:LocalSetup):Promise<boolean>}
export type SetupTransport={read():Promise<SetupBootstrap>;write(draft:SetupDraft,revision:number,action:'draft'|'complete'):Promise<{ok:true;revision?:number;completed?:boolean;alreadyCompleted?:boolean}>};
export function newLocalSetup(scope:string):LocalSetup{return {version:1,scope,localVersion:0,writeId:'',draft:emptySetupDraft(),serverRevision:null,baseline:null,pending:null,completed:false,checked:false,reviewing:false,attempts:[],existingGoal:null,conflict:null,retainedDraft:null,lastSent:null};}
const same=(a:SetupDraft|null,b:SetupDraft|null)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeSetupBootstrap(local:LocalSetup,remote:SetupBootstrap,ownerId:string):LocalSetup{
 if(typeof remote.completed!=='boolean'||!Array.isArray(remote.attempts))throw new Error('The setup response is incomplete.');
 if(remote.ownerId!==ownerId)throw new SetupRequestError('Your signed-in account changed. Reopen setup for that account.',409);
 if(remote.completed)return {...local,checked:true,completed:true,pending:null,conflict:null};
 if(!remote.state||!Number.isSafeInteger(remote.state.revision)||remote.state.revision<0||!validateSetupDraft(remote.state.draft,remote.attempts).ok)throw new Error('The setup response is incomplete.');
 const common={...local,completed:false,checked:true,attempts:remote.attempts,existingGoal:remote.existingGoal};
 if((local.pending||local.reviewing)&&local.serverRevision!==null&&remote.state.revision!==local.serverRevision&&!same(local.draft,remote.state.draft)&&!(local.lastSent&&remote.state.revision===local.lastSent.revision+1&&same(remote.state.draft,local.lastSent.draft)))return {...common,conflict:remote};
 if(local.pending||local.reviewing){const draft=reconcileSavedSetup(local.draft,remote.attempts),invalidated=!same(draft,local.draft);return {...common,draft,serverRevision:remote.state.revision,baseline:remote.state.draft,conflict:null,reviewing:local.reviewing||invalidated,pending:invalidated?null:same(draft,remote.state.draft)&&local.pending==='draft'?null:local.pending};}
 return {...common,draft:remote.state.draft,serverRevision:remote.state.revision,baseline:remote.state.draft,conflict:null};
}
/** Disk writes remain short and serialized; network I/O never holds that queue. */
export class SetupCoordinator {
 record:LocalSetup;error='';syncing=false;private stopped=false;private authBlocked=false;private verifiedThisRun=false;private refreshing=false;private running:Promise<void>|null=null;private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly scope:string,readonly ownerId:string|null,private store:SetupStore,private transport:SetupTransport|null,private changed:(replace:boolean,finished?:boolean)=>void=()=>{}){if(ownerId&&scope!==`account:${ownerId}`)throw new Error('Setup scope does not match this account.');this.record=newLocalSetup(scope);}
 private serial<T>(work:()=>Promise<T>):Promise<T>{const next=this.queue.then(work);this.queue=next.catch(()=>undefined);return next;}
 private async commit(value:LocalSetup){const next={...value,localVersion:this.record.localVersion+1,writeId:crypto.randomUUID()};if(!await this.store.cas(this.scope,this.record.localVersion,next))throw new SetupRequestError('Setup changed in another window. Reload saved choices before continuing.',409);this.record=next;}
 async initialize(initial?:SetupBootstrap){await this.serial(async()=>{this.record=await this.store.read(this.scope)||newLocalSetup(this.scope);const finished=Boolean(initial?.completed&&this.record.pending==='complete');if(initial&&this.ownerId){await this.commit(mergeSetupBootstrap(this.record,initial,this.ownerId));this.verifiedThisRun=true;}this.changed(true,finished);});}
 async save(draft:SetupDraft,action:'draft'|'complete'='draft',confirmed=true){
  const checked=validateSetupDraft(draft,this.record.attempts,action==='complete');if(!checked.ok)throw new SetupRequestError(checked.error,400);
  await this.serial(async()=>{if(this.stopped)throw new Error('This setup is no longer active.');if(this.record.completed)return;await this.commit({...this.record,draft:checked.value,pending:!confirmed&&this.record.reviewing?null:action,reviewing:!confirmed&&this.record.reviewing,conflict:null});this.error='';this.changed(false);});
  void this.flush();return {revision:this.record.serverRevision||0,alreadyCompleted:this.record.completed};
 }
 async capture(draft:SetupDraft){await this.save(draft,'draft',false);}
 async refresh(){if(this.stopped||this.syncing||this.refreshing||this.record.completed&&this.verifiedThisRun||!this.transport||!this.ownerId)return;this.refreshing=true;try{const remote=await this.transport.read();await this.serial(async()=>{if(this.stopped)return;const finished=this.record.pending==='complete'&&remote.completed;const next=mergeSetupBootstrap(this.record,remote,this.ownerId!);const replaced=!same(next.draft,this.record.draft)||Boolean(next.conflict);await this.commit(next);this.authBlocked=false;this.verifiedThisRun=true;this.error=next.conflict?'Setup also changed on another device. Choose which version to review.':'';this.changed(replaced,finished);});}catch(e){if(e instanceof SetupRequestError&&(e.status===401||e.status===409))this.authBlocked=true;this.error=e instanceof Error?e.message:'Setup could not refresh.';this.changed(false);}finally{this.refreshing=false;await this.flush();}}
 async flush(){if(this.running)return this.running;this.running=this.runFlush().finally(()=>{this.running=null;});return this.running;}
 private async runFlush(){if(this.syncing||this.refreshing||this.stopped||this.authBlocked||!this.transport||!this.ownerId||typeof navigator!=='undefined'&&navigator.onLine===false)return;this.syncing=true;this.changed(false);try{
  for(let i=0;i<8&&!this.stopped;i++){
   await this.queue;if(this.stopped)break;let sent=this.record;if(!sent.pending||sent.completed||sent.conflict||sent.serverRevision===null)break;
   await this.serial(async()=>{await this.commit({...this.record,lastSent:{draft:this.record.draft,revision:this.record.serverRevision!,action:this.record.pending!}});sent=this.record;this.changed(false);});if(this.stopped)break;
   const result=await this.transport.write(sent.draft,sent.serverRevision,sent.pending);
   if(result.ok!==true||(!result.alreadyCompleted&&(sent.pending==='complete'?result.completed!==true:typeof result.revision!=='number'||!Number.isSafeInteger(result.revision)||result.revision<=sent.serverRevision)))throw new Error('The server did not confirm setup. Your device draft is retained.');
   await this.serial(async()=>{if(this.stopped)return;const completed=result.alreadyCompleted===true||result.completed===true;this.verifiedThisRun=true;await this.commit({...this.record,completed,serverRevision:result.revision??this.record.serverRevision,baseline:sent.draft,lastSent:null,pending:completed||this.record.writeId===sent.writeId?null:this.record.pending});this.error='';this.changed(false,completed);});
  }
 }catch(e){if(e instanceof SetupRequestError&&e.status===401)this.authBlocked=true;this.error=e instanceof Error?e.message:'Sync paused. Your device draft is retained.';if(e instanceof SetupRequestError&&(e.status===409||e.status===400))await this.refreshAfterError();this.changed(false);}finally{this.syncing=false;this.changed(false);}}
 private async refreshAfterError(){try{const remote=await this.transport!.read();await this.serial(async()=>{if(this.stopped)return;const next=mergeSetupBootstrap(this.record,remote,this.ownerId!);await this.commit(next);this.changed(true);});}catch{/* Keep local edits if refresh is unavailable or belongs to another account. */}}
 async resolve(useDevice:boolean){await this.serial(async()=>{const remote=this.record.conflict;if(!remote?.state)return;const device=this.record.draft;await this.commit({...this.record,draft:useDevice?reconcileSavedSetup(device,remote.attempts):remote.state.draft,retainedDraft:device,baseline:remote.state.draft,serverRevision:remote.state.revision,conflict:null,pending:null,reviewing:useDevice});this.error='';this.changed(true);});}
 async importDraft(source:LocalSetup){await this.serial(async()=>{
  if(source.scope!=='installation'||this.record.completed||this.record.pending||this.record.serverRevision!==0||this.record.draft.level)throw new Error('This account already has setup choices. Its draft stays separate.');
  const draft=reconcileSavedSetup(source.draft,this.record.attempts),checked=validateSetupDraft(draft,this.record.attempts);if(!checked.ok)throw new Error(checked.error);
  const next={...this.record,draft:checked.value,pending:'draft' as const,localVersion:this.record.localVersion+1,writeId:crypto.randomUUID()};
  if(!await this.store.handoff(source,this.record.localVersion,next))throw new SetupRequestError('The device or account draft changed. Reload before moving it.',409);
  this.record=next;this.changed(true);
 });void this.flush();}
 async cancelFinish(){await this.serial(async()=>{if(this.record.completed)return;await this.commit({...this.record,pending:'draft'});this.changed(false);});}
 async reload(){await this.serial(async()=>{this.record=await this.store.read(this.scope)||newLocalSetup(this.scope);this.error='';this.changed(true);});void this.refresh();}
 stop(){this.stopped=true;}
 get readyToImport(){return this.record.checked&&!this.record.completed&&!this.record.pending&&this.record.serverRevision===0&&!this.record.draft.level;}
 get needsReview(){return Boolean(setupReadiness(this.record.draft,this.record.attempts));}
}
