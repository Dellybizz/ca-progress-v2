import "server-only";

import { getD1RuntimeDatabase, type D1DatabaseLike } from "@/lib/data/d1/client";
import { isApprovedIcaiUrl } from "@/lib/icai/html";

export type IcaiReviewDecision = "approve" | "reject";
type D1StatementLike = ReturnType<D1DatabaseLike["prepare"]>;
type ReviewRow = {
  id:string;
  change_event_id:number;
  run_id:string;
  source_id:string;
  entity_type:string;
  entity_id:string;
  proposed_patch:string|Record<string,unknown>;
  status:string;
  created_at:string;
};
type ChangeEventRow = {
  id:number;
  run_id:string;
  source_id:string;
  entity_type:string;
  entity_id:string;
  change_type:string;
  field_name:string|null;
  old_value:string|Record<string,unknown>|null;
  new_value:string|Record<string,unknown>|null;
  decision_status:string;
  applied_at:string|null;
};
type ReviewPlan = {
  statement:D1StatementLike;
  before:Record<string,unknown>;
  after:Record<string,unknown>;
  patch:Record<string,unknown>;
};

const ATTEMPT_PATCH_KEYS = new Set(["start_date","end_date","label","status","source_url","source_snapshot_id","content_hash","metadata"]);
const EVENT_PATCH_KEYS = new Set(["event_date","start_time","end_time","title","subject_id","source_url","source_snapshot_id","content_hash","metadata"]);
const RESOURCE_PATCH_KEYS = new Set(["status","source_snapshot_id"]);

export function normalizeIcaiReviewDecision(value:unknown):IcaiReviewDecision|null {
  const raw=String(value??"").trim().toLowerCase();
  if(raw==="approve"||raw==="approved")return "approve";
  if(raw==="reject"||raw==="rejected")return "reject";
  return null;
}

function objectValue(value:unknown,label:string):Record<string,unknown>{
  if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;
  if(typeof value==="string"){
    try{
      const parsed=JSON.parse(value) as unknown;
      if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed as Record<string,unknown>;
    }catch{/* handled below */}
  }
  throw new Error(`${label} must be a JSON object.`);
}
function objectOrEmpty(value:unknown):Record<string,unknown>{
  if(value==null)return {};
  try{return objectValue(value,"ICAI review value");}catch{return {};}
}
function own(value:Record<string,unknown>,key:string){return Object.prototype.hasOwnProperty.call(value,key);}
function cleanNotes(value:string|null|undefined){const next=(value??"").trim();return next?next.slice(0,2_000):null;}
function text(value:unknown,label:string,max=500){if(typeof value!=="string")throw new Error(`${label} must be text.`);const next=value.trim();if(!next||next.length>max)throw new Error(`${label} is invalid.`);return next;}
function nullableText(value:unknown,label:string,max=500){if(value==null||value==="")return null;if(typeof value!=="string")throw new Error(`${label} must be text or null.`);const next=value.trim();if(!next||next.length>max)throw new Error(`${label} is invalid.`);return next;}
function dateValue(value:unknown,label:string){const next=nullableText(value,label,10);if(next===null)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(next)||Number.isNaN(Date.parse(`${next}T00:00:00Z`)))throw new Error(`${label} must be YYYY-MM-DD.`);return next;}
function timeValue(value:unknown,label:string){const next=nullableText(value,label,8);if(next===null)return null;if(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(next))throw new Error(`${label} must be HH:MM or HH:MM:SS.`);return next;}
function approvedUrl(value:unknown,label:string){const next=text(value,label,2_000);if(!isApprovedIcaiUrl(next))throw new Error(`${label} must remain on an approved ICAI host.`);return next;}
function hashValue(value:unknown){const next=text(value,"ICAI content hash",128);if(!/^[a-f0-9]{64}$/i.test(next))throw new Error("ICAI content hash is invalid.");return next.toLowerCase();}
function metadataValue(value:unknown){const next=objectValue(value,"ICAI metadata");const encoded=JSON.stringify(next);if(encoded.length>32_000)throw new Error("ICAI metadata is too large.");return next;}
function assertOnlyKeys(value:Record<string,unknown>,allowed:Set<string>){for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`Unsupported ICAI review patch field: ${key}`);}
function comparable(value:unknown){return value==null||value===""?null:value;}
function assertEqualField(actual:unknown,expected:unknown,label:string){if(JSON.stringify(comparable(actual))!==JSON.stringify(comparable(expected)))throw new Error(`ICAI review is stale: ${label} no longer matches the detected change.`);}
function jsonRecord(value:unknown){if(value&&typeof value==="object"&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value==="string"){try{return objectValue(value,"ICAI metadata");}catch{return {};}}return {};}
function canonicalSnapshot(row:Record<string,unknown>,keys:string[]){const out:Record<string,unknown>={};for(const key of keys)out[key]=row[key]??null;return out;}

async function releaseClaim(db:D1DatabaseLike,id:string){await db.prepare("UPDATE icai_review_queue SET status='pending',reviewed_by=NULL,reviewed_at=NULL,decision_notes=NULL,updated_at=?1 WHERE id=?2 AND status='applying'").bind(new Date().toISOString(),id).run();}

async function claimReview(db:D1DatabaseLike,id:string,reviewerUserId:string,notes:string|null){
  const now=new Date().toISOString();
  const row=await db.prepare("UPDATE icai_review_queue SET status='applying',reviewed_by=?1,reviewed_at=?2,decision_notes=?3,updated_at=?2 WHERE id=?4 AND status='pending' RETURNING id,change_event_id,run_id,source_id,entity_type,entity_id,proposed_patch,status,created_at")
    .bind(reviewerUserId,now,notes,id).first<ReviewRow>();
  if(row)return row;
  const existing=await db.prepare("SELECT status FROM icai_review_queue WHERE id=?1").bind(id).first<{status:string}>();
  if(!existing)throw new Error("ICAI review item was not found.");
  throw new Error(`ICAI review item is already ${existing.status}.`);
}

async function loadChangeEvent(db:D1DatabaseLike,review:ReviewRow){
  const change=await db.prepare("SELECT id,run_id,source_id,entity_type,entity_id,change_type,field_name,old_value,new_value,decision_status,applied_at FROM icai_change_events WHERE id=?1")
    .bind(review.change_event_id).first<ChangeEventRow>();
  if(!change)throw new Error("ICAI review change event was not found.");
  if(change.run_id!==review.run_id||change.source_id!==review.source_id||change.entity_type!==review.entity_type||change.entity_id!==review.entity_id)throw new Error("ICAI review queue and change event do not match.");
  if(change.decision_status!=="pending_review"||change.applied_at)throw new Error("ICAI review change event is no longer pending.");
  return change;
}

async function assertSnapshot(db:D1DatabaseLike,review:ReviewRow,snapshotId:string){
  const row=await db.prepare("SELECT id FROM icai_source_snapshots WHERE id=?1 AND run_id=?2 AND source_id=?3").bind(snapshotId,review.run_id,review.source_id).first<{id:string}>();
  if(!row)throw new Error("ICAI review source snapshot does not belong to this run and source.");
}

function assertCurrentMatchesOld(current:Record<string,unknown>,change:ChangeEventRow,allowed:Set<string>){
  const oldValue=objectOrEmpty(change.old_value);
  for(const [key,value] of Object.entries(oldValue))if(allowed.has(key))assertEqualField(current[key],value,key);
}
function assertPatchMatchesNew(patch:Record<string,unknown>,change:ChangeEventRow,allowed:Set<string>){
  const newValue=objectOrEmpty(change.new_value);
  for(const [key,value] of Object.entries(newValue))if(allowed.has(key)&&own(patch,key))assertEqualField(patch[key],value,key);
}

async function attemptPlan(db:D1DatabaseLike,review:ReviewRow,change:ChangeEventRow,patch:Record<string,unknown>,now:string):Promise<ReviewPlan>{
  assertOnlyKeys(patch,ATTEMPT_PATCH_KEYS);
  const current=await db.prepare("SELECT * FROM exam_attempts WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();
  if(!current)throw new Error("Reviewed exam attempt no longer exists.");
  assertCurrentMatchesOld(current,change,ATTEMPT_PATCH_KEYS);
  assertPatchMatchesNew(patch,change,ATTEMPT_PATCH_KEYS);

  const startDate=own(patch,"start_date")?dateValue(patch.start_date,"Exam start date"):dateValue(current.start_date,"Exam start date");
  const endDate=own(patch,"end_date")?dateValue(patch.end_date,"Exam end date"):dateValue(current.end_date,"Exam end date");
  if(startDate&&endDate&&endDate<startDate)throw new Error("Exam end date cannot be before the start date.");
  const label=own(patch,"label")?text(patch.label,"Exam attempt label",200):text(current.label,"Exam attempt label",200);
  const status=own(patch,"status")?text(patch.status,"Exam attempt status",64):text(current.status,"Exam attempt status",64);
  const sourceUrl=own(patch,"source_url")?approvedUrl(patch.source_url,"Exam attempt source URL"):approvedUrl(current.source_url,"Exam attempt source URL");
  const snapshotId=own(patch,"source_snapshot_id")?text(patch.source_snapshot_id,"ICAI source snapshot id",120):text(current.source_snapshot_id,"ICAI source snapshot id",120);
  const contentHash=own(patch,"content_hash")?hashValue(patch.content_hash):hashValue(current.content_hash);
  const metadata=own(patch,"metadata")?metadataValue(patch.metadata):jsonRecord(current.metadata);
  await assertSnapshot(db,review,snapshotId);

  const before=canonicalSnapshot(current,["id","level_id","attempt_key","label","start_date","end_date","status","verification_status","verification_method","source_id","source_url","source_snapshot_id","content_hash","metadata"]);
  const after={...before,label,start_date:startDate,end_date:endDate,status,verification_status:"verified",verification_method:"official_sync",source_id:review.source_id,source_url:sourceUrl,source_snapshot_id:snapshotId,content_hash:contentHash,metadata};
  const statement=db.prepare("UPDATE exam_attempts SET start_date=?1,end_date=?2,label=?3,status=?4,verification_status='verified',verification_method='official_sync',source_id=?5,source_url=?6,source_snapshot_id=?7,content_hash=?8,metadata=?9,last_seen_at=?10,last_changed_at=?10,updated_at=?10 WHERE id=?11")
    .bind(startDate,endDate,label,status,review.source_id,sourceUrl,snapshotId,contentHash,JSON.stringify(metadata),now,review.entity_id);
  return{statement,before,after,patch};
}

async function eventPlan(db:D1DatabaseLike,review:ReviewRow,change:ChangeEventRow,patch:Record<string,unknown>,now:string):Promise<ReviewPlan>{
  assertOnlyKeys(patch,EVENT_PATCH_KEYS);
  const current=await db.prepare("SELECT * FROM exam_events WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();
  if(!current)throw new Error("Reviewed exam event no longer exists.");
  assertCurrentMatchesOld(current,change,EVENT_PATCH_KEYS);
  assertPatchMatchesNew(patch,change,EVENT_PATCH_KEYS);

  const eventDate=own(patch,"event_date")?dateValue(patch.event_date,"Exam event date"):dateValue(current.event_date,"Exam event date");
  if(!eventDate)throw new Error("Exam event date is required.");
  const startTime=own(patch,"start_time")?timeValue(patch.start_time,"Exam event start time"):timeValue(current.start_time,"Exam event start time");
  const endTime=own(patch,"end_time")?timeValue(patch.end_time,"Exam event end time"):timeValue(current.end_time,"Exam event end time");
  const title=own(patch,"title")?text(patch.title,"Exam event title",300):text(current.title,"Exam event title",300);
  const subjectId=own(patch,"subject_id")?nullableText(patch.subject_id,"Exam event subject id",120):nullableText(current.subject_id,"Exam event subject id",120);
  if(subjectId){const subject=await db.prepare("SELECT id FROM subjects WHERE id=?1 AND is_active=1").bind(subjectId).first<{id:string}>();if(!subject)throw new Error("Exam event subject is not an active canonical subject.");}
  const sourceUrl=own(patch,"source_url")?approvedUrl(patch.source_url,"Exam event source URL"):approvedUrl(current.source_url,"Exam event source URL");
  const snapshotId=own(patch,"source_snapshot_id")?text(patch.source_snapshot_id,"ICAI source snapshot id",120):text(current.source_snapshot_id,"ICAI source snapshot id",120);
  const contentHash=own(patch,"content_hash")?hashValue(patch.content_hash):hashValue(current.content_hash);
  const metadata=own(patch,"metadata")?metadataValue(patch.metadata):jsonRecord(current.metadata);
  await assertSnapshot(db,review,snapshotId);

  const before=canonicalSnapshot(current,["id","attempt_id","event_type","title","event_date","start_time","end_time","subject_id","verification_status","source_id","source_url","source_snapshot_id","content_hash","metadata"]);
  const after={...before,title,event_date:eventDate,start_time:startTime,end_time:endTime,subject_id:subjectId,verification_status:"verified",source_id:review.source_id,source_url:sourceUrl,source_snapshot_id:snapshotId,content_hash:contentHash,metadata};
  const statement=db.prepare("UPDATE exam_events SET event_date=?1,start_time=?2,end_time=?3,title=?4,subject_id=?5,verification_status='verified',source_id=?6,source_url=?7,source_snapshot_id=?8,content_hash=?9,metadata=?10,last_seen_at=?11,last_changed_at=?11,updated_at=?11 WHERE id=?12")
    .bind(eventDate,startTime,endTime,title,subjectId,review.source_id,sourceUrl,snapshotId,contentHash,JSON.stringify(metadata),now,review.entity_id);
  return{statement,before,after,patch};
}

async function resourcePlan(db:D1DatabaseLike,review:ReviewRow,change:ChangeEventRow,patch:Record<string,unknown>,now:string):Promise<ReviewPlan>{
  assertOnlyKeys(patch,RESOURCE_PATCH_KEYS);
  const current=await db.prepare("SELECT * FROM icai_resources WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();
  if(!current)throw new Error("Reviewed ICAI resource no longer exists.");
  if(String(current.source_id)!==review.source_id)throw new Error("ICAI resource source no longer matches the review item.");
  assertCurrentMatchesOld(current,change,RESOURCE_PATCH_KEYS);
  assertPatchMatchesNew(patch,change,RESOURCE_PATCH_KEYS);
  const status=text(patch.status,"ICAI resource status",32);
  if(status!=="removed")throw new Error("Only reviewed ICAI resource removal is supported.");
  const snapshotId=text(patch.source_snapshot_id,"ICAI source snapshot id",120);
  await assertSnapshot(db,review,snapshotId);
  const before=canonicalSnapshot(current,["id","source_id","source_snapshot_id","resource_type","title","official_url","status","verification_status","content_hash","metadata"]);
  const after={...before,status:"removed",source_snapshot_id:snapshotId};
  const statement=db.prepare("UPDATE icai_resources SET status='removed',source_snapshot_id=?1,last_changed_at=?2,updated_at=?2 WHERE id=?3 AND source_id=?4")
    .bind(snapshotId,now,review.entity_id,review.source_id);
  return{statement,before,after,patch};
}

async function approvalPlan(db:D1DatabaseLike,review:ReviewRow,change:ChangeEventRow,now:string){
  const patch=objectValue(review.proposed_patch,"ICAI proposed patch");
  if(review.entity_type==="exam_attempt")return attemptPlan(db,review,change,patch,now);
  if(review.entity_type==="exam_event")return eventPlan(db,review,change,patch,now);
  if(review.entity_type==="resource")return resourcePlan(db,review,change,patch,now);
  throw new Error(`Unsupported ICAI review entity type: ${review.entity_type}`);
}

async function rejectionSnapshot(db:D1DatabaseLike,review:ReviewRow){
  const patch=objectValue(review.proposed_patch,"ICAI proposed patch");
  if(review.entity_type==="exam_attempt"){const row=await db.prepare("SELECT * FROM exam_attempts WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();return{patch,before:row??{missing:true},after:row??{missing:true}};}
  if(review.entity_type==="exam_event"){const row=await db.prepare("SELECT * FROM exam_events WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();return{patch,before:row??{missing:true},after:row??{missing:true}};}
  if(review.entity_type==="resource"){const row=await db.prepare("SELECT * FROM icai_resources WHERE id=?1").bind(review.entity_id).first<Record<string,unknown>>();return{patch,before:row??{missing:true},after:row??{missing:true}};}
  return{patch,before:{unsupported_entity_type:review.entity_type},after:{unsupported_entity_type:review.entity_type}};
}

export async function decideIcaiReview({reviewId,decision,reviewerUserId,notes=null,db=getD1RuntimeDatabase()}:{reviewId:string;decision:IcaiReviewDecision;reviewerUserId:string;notes?:string|null;db?:D1DatabaseLike}){
  if(!reviewId||!reviewerUserId)throw new Error("Review id and reviewer are required.");
  const decisionNotes=cleanNotes(notes);
  const review=await claimReview(db,reviewId,reviewerUserId,decisionNotes);
  const now=new Date().toISOString();
  try{
    const change=await loadChangeEvent(db,review);
    const finalStatus=decision==="approve"?"approved":"rejected";
    const statements:D1StatementLike[]=[];
    let patch:Record<string,unknown>;
    let before:Record<string,unknown>;
    let after:Record<string,unknown>;

    if(decision==="approve"){
      const plan=await approvalPlan(db,review,change,now);
      patch=plan.patch;before=plan.before;after=plan.after;statements.push(plan.statement);
    }else{
      const snapshot=await rejectionSnapshot(db,review);
      patch=snapshot.patch;before=snapshot.before;after=snapshot.after;
    }

    statements.push(db.prepare("INSERT INTO icai_review_decisions(id,review_id,change_event_id,run_id,source_id,entity_type,entity_id,decision,reviewer_user_id,decision_notes,proposed_patch,canonical_before,canonical_after,decided_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)")
      .bind(crypto.randomUUID(),review.id,review.change_event_id,review.run_id,review.source_id,review.entity_type,review.entity_id,finalStatus,reviewerUserId,decisionNotes,JSON.stringify(patch),JSON.stringify(before),JSON.stringify(after),now));
    statements.push(db.prepare("UPDATE icai_review_queue SET status=?1,reviewed_by=?2,reviewed_at=?3,decision_notes=?4,updated_at=?3 WHERE id=?5 AND status='applying'")
      .bind(finalStatus,reviewerUserId,now,decisionNotes,reviewId));
    statements.push(db.prepare("UPDATE icai_change_events SET decision_status=?1,review_notes=?2,reviewed_by=?3,applied_at=?4 WHERE id=?5 AND decision_status='pending_review'")
      .bind(finalStatus,decisionNotes,reviewerUserId,decision==="approve"?now:null,review.change_event_id));
    await db.batch(statements);
    return{ok:true,status:finalStatus};
  }catch(error){
    await releaseClaim(db,reviewId).catch(()=>undefined);
    throw error;
  }
}
