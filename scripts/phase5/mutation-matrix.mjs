import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { ExactCleanupRegistry, fixtureMarker, normalizeProgressSnapshot, buildProgressRestoreSql, progressSnapshotComparable, sqlLiteral } from './phase2-fixture-helpers.mjs';

const REPORT_DIRECTORY='phase3-report';
const DB=process.env.PHASE3_D1_DATABASE||'ca-progress-v2-phase4-shadow';
const BASE=(process.env.SMOKE_BASE_URL||'https://ca-progress-v2.habeebaasif622.workers.dev').replace(/\/$/,'');
const REQUIRED=['SMOKE_MUTATION_AUTH_COOKIE','SMOKE_MODERATOR_AUTH_COOKIE','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','PHASE3_D1_DATABASE'];
const SECRET_NAMES=['SMOKE_MUTATION_AUTH_COOKIE','SMOKE_MODERATOR_AUTH_COOKIE','CLOUDFLARE_API_TOKEN'];
const marker=fixtureMarker();
const checks=[]; const sensitive=SECRET_NAMES.map(k=>process.env[k]||'').filter(Boolean); const observed=[];
const cleanup=new ExactCleanupRegistry();
let normalId=null, moderatorId=null, fixture=null, readBefore=null, progressBefore=null, revisionDueBefore=[];

const hash=v=>createHash('sha256').update(String(v)).digest('hex').slice(0,16);
function redact(v){let s=String(v??''); for(const x of [...sensitive,...observed].sort((a,b)=>b.length-a.length)){if(x.length>=4)s=s.split(x).join(`[redacted:${hash(x)}]`);} return s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted-email]').replace(/([?&](?:code|token|key|secret)=)[^&\s]+/gi,'$1[redacted]').slice(0,2400);}
function record(name,status,evidence,required=true){if(!['passed','failed','unsupported'].includes(status))throw new Error(`bad status ${status}`); checks.push({name,status,required,evidence:redact(evidence)});}
function cookie(name){const v=(process.env[name]||'').trim(); if(!v)return ''; if(/[\r\n]/.test(v))throw new Error(`${name} contains newline`); return v.includes('=')?v:`ca_session=${v}`;}
function remote(sql){const r=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['wrangler','d1','execute',DB,'--remote','--json','--config','wrangler.web.jsonc','--command',sql],{encoding:'utf8',env:process.env,maxBuffer:10*1024*1024}); if(r.error||r.status!==0)throw new Error(redact(r.error?.message||r.stderr||`wrangler ${r.status}`)); const p=JSON.parse(r.stdout); const e=Array.isArray(p)?p[0]:p; if(!e?.success||!Array.isArray(e.results))throw new Error('malformed D1 response'); return e.results;}
async function req(path,{method='GET',who='normal',body,headers={},redirect='manual'}={}){const c=who==='normal'?cookie('SMOKE_MUTATION_AUTH_COOKIE'):who==='moderator'?cookie('SMOKE_MODERATOR_AUTH_COOKIE'):''; const h={accept:'application/json','x-ca-phase3-test':marker,...headers}; if(c)h.cookie=c; if(body!==undefined)h['content-type']='application/json'; const res=await fetch(`${BASE}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect}); let data=null; const text=await res.text(); try{data=text?JSON.parse(text):null;}catch{data=text;} return {status:res.status,ok:res.ok,data,headers:res.headers};}
async function viewer(label,who){const r=await req('/api/auth/viewer',{who}); if(r.ok&&r.data?.authenticated&&typeof r.data.id==='string'){observed.push(r.data.id); record(`${label} authentication`,'passed',`HTTP ${r.status}; hash=${hash(r.data.id)}`); return r.data.id;} record(`${label} authentication`,'failed',`HTTP ${r.status}`); return null;}
function one(sql){return remote(sql)[0]||null;}
function count(sql){return Number(one(sql)?.n||0);}
function exactRowDelete(table,id){remote(`DELETE FROM ${table} WHERE id=${sqlLiteral(id)}`);}
async function assertHttp(name,r,statuses,extra=''){record(name,statuses.includes(r.status)?'passed':'failed',`HTTP ${r.status}${extra?`; ${extra}`:''}`); return statuses.includes(r.status);}

function discover(){
 const profile=one(`SELECT p.ca_level,p.group_choice,p.attempt_key,l.id level_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level WHERE p.user_id=${sqlLiteral(normalId)} AND p.onboarding_completed_at IS NOT NULL LIMIT 1`);
 if(!profile)throw new Error('normal user has no complete academic profile');
 const academic=one(`SELECT s.id subject_id,s.title subject_title,sv.id syllabus_version_id,c.id chapter_id,c.stable_key chapter_key,g.id group_id,g.code group_code FROM profiles p JOIN course_levels l ON l.code=p.ca_level JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key JOIN course_groups g ON g.id=asm.group_id JOIN subjects s ON s.id=asm.subject_id JOIN syllabus_versions sv ON sv.id=asm.syllabus_version_id JOIN chapters c ON c.syllabus_version_id=sv.id WHERE p.user_id=${sqlLiteral(normalId)} AND p.onboarding_completed_at IS NOT NULL AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) ORDER BY s.sort_order,c.sort_order LIMIT 1`);
 if(!academic)throw new Error('no applicable chapter fixture');
 const channel=one(`SELECT cc.id channel_id,cc.slug channel_slug,cc.scope_type,cc.write_policy FROM community_channels cc WHERE cc.is_active=1 AND cc.write_policy IN ('members','all') AND (cc.scope_type='global' OR (cc.scope_type='level' AND cc.level_id=${sqlLiteral(profile.level_id)}) OR (cc.scope_type='subject' AND cc.subject_id=${sqlLiteral(academic.subject_id)})) ORDER BY CASE cc.scope_type WHEN 'subject' THEN 0 WHEN 'level' THEN 1 ELSE 2 END,cc.sort_order LIMIT 1`);
 if(!channel)throw new Error('no writable community fixture');
 return {...profile,...academic,...channel};
}

async function communityMatrix(){
 const messageBody=`${marker} community`;
 const beforeMarker=count(`SELECT COUNT(*) n FROM community_messages WHERE body=${sqlLiteral(messageBody)}`);
 const guest=await req(`/api/community/channels/${encodeURIComponent(fixture.channel_slug)}/messages`,{method:'POST',who:'guest',body:{body:messageBody}});
 const afterGuest=count(`SELECT COUNT(*) n FROM community_messages WHERE body=${sqlLiteral(messageBody)}`);
 record('community guest create rejected without D1 mutation',guest.status===401&&beforeMarker===afterGuest?'passed':'failed',`HTTP ${guest.status}; rows ${beforeMarker}->${afterGuest}`);

 const created=await req(`/api/community/channels/${encodeURIComponent(fixture.channel_slug)}/messages`,{method:'POST',body:{body:messageBody}});
 if(!(await assertHttp('community create',created,[201])))return;
 const messageId=created.data?.id; if(!messageId){record('community create D1 evidence','failed','response missing id'); return;} observed.push(messageId);
 cleanup.capture({kind:'community_message',id:messageId,cleanup:async id=>{remote(`DELETE FROM moderation_actions WHERE message_id=${sqlLiteral(id)}`);remote(`DELETE FROM message_reports WHERE message_id=${sqlLiteral(id)}`);remote(`DELETE FROM message_reactions WHERE message_id=${sqlLiteral(id)}`);remote(`DELETE FROM pinned_messages WHERE message_id=${sqlLiteral(id)}`);exactRowDelete('community_messages',id);}});
 const msg=one(`SELECT id,channel_id,user_id,moderation_status FROM community_messages WHERE id=${sqlLiteral(messageId)}`);
 record('community create D1 evidence',msg?.channel_id===fixture.channel_id&&msg?.user_id===normalId?'passed':'failed',`row=${Boolean(msg)}; status=${msg?.moderation_status||'missing'}`);

 const reaction=await req(`/api/community/messages/${messageId}/reaction`,{method:'POST',body:{emoji:'👍'}}); await assertHttp('community reaction',reaction,[200]);
 record('community reaction D1 evidence',count(`SELECT COUNT(*) n FROM message_reactions WHERE message_id=${sqlLiteral(messageId)} AND user_id=${sqlLiteral(normalId)} AND emoji='👍'`)==1?'passed':'failed','exact reaction row checked');

 readBefore=one(`SELECT channel_id,user_id,last_read_sequence,last_read_at,updated_at FROM channel_read_state WHERE channel_id=${sqlLiteral(fixture.channel_id)} AND user_id=${sqlLiteral(normalId)} LIMIT 1`);
 const sequence=Number(created.data?.sequence||one(`SELECT sequence_id FROM community_messages WHERE id=${sqlLiteral(messageId)}`)?.sequence_id||0);
 const read=await req(`/api/community/channels/${encodeURIComponent(fixture.channel_slug)}/read`,{method:'POST',body:{sequence}}); await assertHttp('community read state',read,[200]);
 const readNow=one(`SELECT last_read_sequence FROM channel_read_state WHERE channel_id=${sqlLiteral(fixture.channel_id)} AND user_id=${sqlLiteral(normalId)}`);
 record('community read D1 evidence',Number(readNow?.last_read_sequence)>=sequence?'passed':'failed',`sequence>=${sequence}`);

 const report=await req(`/api/community/messages/${messageId}/report`,{method:'POST',body:{reason:'other',details:marker}}); await assertHttp('community report',report,[200]);
 const reportId=report.data?.reportId; if(reportId){observed.push(reportId); cleanup.capture({kind:'community_report',id:reportId,cleanup:async id=>exactRowDelete('message_reports',id)});}
 record('community report D1 evidence',reportId&&count(`SELECT COUNT(*) n FROM message_reports WHERE id=${sqlLiteral(reportId)} AND message_id=${sqlLiteral(messageId)} AND reporter_user_id=${sqlLiteral(normalId)}`)==1?'passed':'failed','exact report row checked');

 const unauthBefore=count(`SELECT COUNT(*) n FROM moderation_actions WHERE message_id=${sqlLiteral(messageId)}`);
 const noRole=await req('/api/admin/community/moderation',{method:'POST',body:{action:'pin',messageId}}); const unauthAfter=count(`SELECT COUNT(*) n FROM moderation_actions WHERE message_id=${sqlLiteral(messageId)}`);
 record('community student moderation rejected without D1 mutation',noRole.status===403&&unauthBefore===unauthAfter?'passed':'failed',`HTTP ${noRole.status}; audit ${unauthBefore}->${unauthAfter}`);

 for(const action of ['pin','delete_message','restore_message']){
   const r=await req('/api/admin/community/moderation',{method:'POST',who:'moderator',body:{action,messageId,reason:marker}});
   await assertHttp(`community moderation ${action}`,r,[200]); const actionId=r.data?.actionId; if(actionId){observed.push(actionId);cleanup.capture({kind:'moderation_action',id:actionId,cleanup:async id=>exactRowDelete('moderation_actions',id)});}
   if(action==='pin')record('community pin D1 evidence',count(`SELECT COUNT(*) n FROM pinned_messages WHERE message_id=${sqlLiteral(messageId)} AND channel_id=${sqlLiteral(fixture.channel_id)}`)==1?'passed':'failed','pin row checked');
   if(action==='delete_message')record('community delete D1 evidence',one(`SELECT moderation_status FROM community_messages WHERE id=${sqlLiteral(messageId)}`)?.moderation_status==='moderated'?'passed':'failed','message moderation status checked');
   if(action==='restore_message')record('community restore D1 evidence',one(`SELECT moderation_status FROM community_messages WHERE id=${sqlLiteral(messageId)}`)?.moderation_status==='active'?'passed':'failed','message moderation status checked');
 }
 record('community moderation audit evidence',count(`SELECT COUNT(*) n FROM moderation_actions WHERE message_id=${sqlLiteral(messageId)} AND actor_user_id=${sqlLiteral(moderatorId)}`)>=3?'passed':'failed','three moderator audit rows required');
 record('community message edit capability','unsupported','No product API route exists for message editing.',false);
}

async function noteAndResourceMatrix(){
 const noteTitle=`${marker} note`;
 const note=await req('/api/notes',{method:'POST',body:{title:noteTitle,bodyHtml:`<p>${marker}</p>`,subjectId:fixture.subject_id,chapterId:fixture.chapter_id,tags:['phase3'],visibility:'shared'}});
 if(await assertHttp('note create',note,[201])){
   const noteId=note.data?.id; if(noteId){observed.push(noteId);cleanup.capture({kind:'note',id:noteId,cleanup:async id=>{remote(`DELETE FROM resource_moderation WHERE note_id=${sqlLiteral(id)}`);remote(`DELETE FROM note_tag_map WHERE note_id=${sqlLiteral(id)}`);exactRowDelete('notes',id);}});
   record('note create D1 evidence',count(`SELECT COUNT(*) n FROM notes WHERE id=${sqlLiteral(noteId)} AND user_id=${sqlLiteral(normalId)} AND visibility='shared'`)==1?'passed':'failed','exact note row checked');
   const foreign=await req(`/api/notes/${noteId}`,{method:'DELETE',who:'moderator'}); record('note ownership protection',!foreign.ok&&count(`SELECT COUNT(*) n FROM notes WHERE id=${sqlLiteral(noteId)} AND user_id=${sqlLiteral(normalId)}`)==1?'passed':'failed',`foreign HTTP ${foreign.status}; owner row preserved`);
   const mod=await req('/api/admin/resources/moderation',{method:'POST',who:'moderator',body:{entityType:'note',entityId:noteId,decision:'approve',notes:marker}}); await assertHttp('note moderation approve',mod,[200]);
   const mrow=one(`SELECT id FROM resource_moderation WHERE note_id=${sqlLiteral(noteId)} AND actor_user_id=${sqlLiteral(moderatorId)} ORDER BY created_at DESC LIMIT 1`); if(mrow?.id){cleanup.capture({kind:'resource_moderation',id:mrow.id,cleanup:async id=>exactRowDelete('resource_moderation',id)}); observed.push(mrow.id);}
   record('note moderation D1 evidence',one(`SELECT moderation_status FROM notes WHERE id=${sqlLiteral(noteId)}`)?.moderation_status==='approved'?'passed':'failed','approved status checked');
   const del=await req(`/api/notes/${noteId}`,{method:'DELETE'}); await assertHttp('note delete',del,[200]); record('note delete D1 evidence',count(`SELECT COUNT(*) n FROM notes WHERE id=${sqlLiteral(noteId)}`)===0?'passed':'failed','note absent after owner delete');
   }
 }

 const pdf=Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
 const filename=`${marker}.pdf`;
 const issued=await req('/api/resources/upload-url',{method:'POST',body:{filename,mimeType:'application/pdf',sizeBytes:pdf.length,title:`${marker} upload`,description:marker,subjectId:fixture.subject_id,chapterId:fixture.chapter_id,visibility:'shared'}});
 if(!(await assertHttp('resource signed upload intent',issued,[200])))return;
 const uploadId=issued.data?.uploadId, uploadUrl=issued.data?.uploadUrl; if(!uploadId||!uploadUrl){record('resource signed upload descriptor','failed','missing uploadId/uploadUrl');return;}
 observed.push(uploadId); cleanup.capture({kind:'r2_upload_intent',id:uploadId,cleanup:async id=>exactRowDelete('r2_upload_intents',id)});
 const put=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:pdf}); record('resource direct signed R2 PUT',put.ok?'passed':'failed',`HTTP ${put.status}`);
 const completed=await req('/api/resources/upload-complete',{method:'POST',body:{uploadId}}); if(!(await assertHttp('resource upload complete',completed,[201])))return;
 const resourceId=completed.data?.id; if(!resourceId){record('resource metadata D1 evidence','failed','missing resource id');return;} observed.push(resourceId);
 const resourceRow=one(`SELECT id,owner_user_id,storage_path,storage_bucket,moderation_status FROM uploaded_resources WHERE id=${sqlLiteral(resourceId)}`);
 const objectKey=resourceRow?.storage_path;
 cleanup.capture({kind:'uploaded_resource',id:resourceId,cleanup:async id=>{const exists=one(`SELECT storage_path FROM uploaded_resources WHERE id=${sqlLiteral(id)}`); if(exists){const target=`ca-progress-v2-staging-user-resources/${exists.storage_path}`; spawnSync(process.platform==='win32'?'npx.cmd':'npx',['wrangler','r2','object','delete',target,'--remote','--config','wrangler.web.jsonc'],{encoding:'utf8',env:process.env}); remote(`DELETE FROM resource_moderation WHERE uploaded_resource_id=${sqlLiteral(id)}`); exactRowDelete('uploaded_resources',id);}}});
 record('resource metadata D1 evidence',resourceRow?.owner_user_id===normalId&&Boolean(objectKey)?'passed':'failed','owner/storage path checked');
 const foreignDel=await req(`/api/resources/${resourceId}`,{method:'DELETE',who:'moderator'}); record('resource ownership protection',foreignDel.status===404&&count(`SELECT COUNT(*) n FROM uploaded_resources WHERE id=${sqlLiteral(resourceId)}`)==1?'passed':'failed',`foreign HTTP ${foreignDel.status}; owner row preserved`);
 const mod=await req('/api/admin/resources/moderation',{method:'POST',who:'moderator',body:{entityType:'upload',entityId:resourceId,decision:'approve',notes:marker}}); await assertHttp('resource moderation approve',mod,[200]);
 const rm=one(`SELECT id FROM resource_moderation WHERE uploaded_resource_id=${sqlLiteral(resourceId)} AND actor_user_id=${sqlLiteral(moderatorId)} ORDER BY created_at DESC LIMIT 1`); if(rm?.id){observed.push(rm.id);cleanup.capture({kind:'resource_moderation',id:rm.id,cleanup:async id=>exactRowDelete('resource_moderation',id)});}
 record('resource moderation D1 evidence',one(`SELECT moderation_status FROM uploaded_resources WHERE id=${sqlLiteral(resourceId)}`)?.moderation_status==='approved'?'passed':'failed','approved status checked');
 const access=await req(`/api/resources/${resourceId}/access`,{who:'moderator'}); record('resource shared access',access.status===307?'passed':'failed',`HTTP ${access.status}; signed redirect=${access.status===307}`);
 const del=await req(`/api/resources/${resourceId}`,{method:'DELETE'}); await assertHttp('resource delete',del,[200]); record('resource delete D1 evidence',count(`SELECT COUNT(*) n FROM uploaded_resources WHERE id=${sqlLiteral(resourceId)}`)===0?'passed':'failed','metadata absent after product delete');
}

async function plannerMatrix(){
 const due=new Date(Date.now()+86400000).toISOString(); const dueDate=due.slice(0,10);
 const invalidTitle=`${marker} invalid-task`; const before=count(`SELECT COUNT(*) n FROM tasks WHERE title=${sqlLiteral(invalidTitle)}`);
 const invalid=await req('/api/planner/tasks',{method:'POST',body:{action:'create',title:invalidTitle,taskKind:'study',subjectId:fixture.subject_id,chapterId:'00000000-0000-0000-0000-000000000000',dueAt:due,estimatedMinutes:20}}); const after=count(`SELECT COUNT(*) n FROM tasks WHERE title=${sqlLiteral(invalidTitle)}`);
 record('planner invalid academic scope rejected without D1 mutation',!invalid.ok&&before===after?'passed':'failed',`HTTP ${invalid.status}; rows ${before}->${after}`);

 const created=await req('/api/planner/tasks',{method:'POST',body:{action:'create',title:`${marker} task`,notes:marker,taskKind:'study',subjectId:fixture.subject_id,chapterId:fixture.chapter_id,dueAt:due,estimatedMinutes:25}});
 if(await assertHttp('planner task create',created,[201])){const id=created.data?.id;if(id){observed.push(id);cleanup.capture({kind:'task',id,cleanup:async x=>exactRowDelete('tasks',x)}); record('planner task create D1 evidence',count(`SELECT COUNT(*) n FROM tasks WHERE id=${sqlLiteral(id)} AND user_id=${sqlLiteral(normalId)}`)==1?'passed':'failed','exact task row');
 const foreign=await req('/api/planner/tasks',{method:'POST',who:'moderator',body:{action:'delete',id}}); record('planner task ownership protection',count(`SELECT COUNT(*) n FROM tasks WHERE id=${sqlLiteral(id)} AND user_id=${sqlLiteral(normalId)}`)==1?'passed':'failed',`foreign HTTP ${foreign.status}; owner row preserved`);
 const upd=await req('/api/planner/tasks',{method:'POST',body:{action:'update',id,title:`${marker} task updated`,notes:marker,taskKind:'revision',subjectId:fixture.subject_id,chapterId:fixture.chapter_id,dueAt:due,estimatedMinutes:30}}); await assertHttp('planner task update',upd,[200]); record('planner task update D1 evidence',one(`SELECT title,task_kind FROM tasks WHERE id=${sqlLiteral(id)}`)?.task_kind==='revision'?'passed':'failed','updated fields checked');
 const tog=await req('/api/planner/tasks',{method:'POST',body:{action:'toggle',id,done:true}}); await assertHttp('planner task toggle',tog,[200]); record('planner task toggle D1 evidence',one(`SELECT status FROM tasks WHERE id=${sqlLiteral(id)}`)?.status==='done'?'passed':'failed','done status checked');
 const del=await req('/api/planner/tasks',{method:'POST',body:{action:'delete',id}}); await assertHttp('planner task delete',del,[200]); record('planner task delete D1 evidence',count(`SELECT COUNT(*) n FROM tasks WHERE id=${sqlLiteral(id)}`)===0?'passed':'failed','task absent');}}

 const goal=await req('/api/planner/goals',{method:'POST',body:{action:'create',title:`${marker} goal`,description:marker,dueDate}}); if(await assertHttp('planner goal create',goal,[201])){const id=goal.data?.id;if(id){cleanup.capture({kind:'goal',id,cleanup:async x=>exactRowDelete('goals',x)}); const tog=await req('/api/planner/goals',{method:'POST',body:{action:'toggle',id,done:true}}); await assertHttp('planner goal toggle',tog,[200]); record('planner goal D1 evidence',one(`SELECT status FROM goals WHERE id=${sqlLiteral(id)}`)?.status==='completed'?'passed':'failed','completed status checked'); const del=await req('/api/planner/goals',{method:'POST',body:{action:'delete',id}}); await assertHttp('planner goal delete',del,[200]);}}

 const start=new Date(Date.now()+2*86400000).toISOString(); const end=new Date(Date.now()+2*86400000+3600000).toISOString(); const cal=await req('/api/planner/calendar',{method:'POST',body:{action:'create',title:`${marker} event`,notes:marker,startsAt:start,endsAt:end,allDay:false}}); if(await assertHttp('planner calendar create',cal,[201])){const id=cal.data?.id;if(id){cleanup.capture({kind:'calendar_event',id,cleanup:async x=>exactRowDelete('user_calendar_events',x)}); const upd=await req('/api/planner/calendar',{method:'POST',body:{action:'update',id,title:`${marker} event updated`,notes:marker,startsAt:start,endsAt:end,allDay:false}}); await assertHttp('planner calendar update',upd,[200]); record('planner calendar D1 evidence',one(`SELECT title FROM user_calendar_events WHERE id=${sqlLiteral(id)}`)?.title?.includes('updated')?'passed':'failed','updated title checked'); const del=await req('/api/planner/calendar',{method:'POST',body:{action:'delete',id}}); await assertHttp('planner calendar delete',del,[200]);}}
}

async function progressMatrix(){
 const row=one(`SELECT user_id,chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,created_at,updated_at FROM chapter_progress WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)} LIMIT 1`);
 progressBefore=normalizeProgressSnapshot(normalId,fixture.chapter_id,row);
 revisionDueBefore=remote(`SELECT id,user_id,chapter_id,revision_number,source_completed_at,due_at,manual_due_at,status,completed_at,created_at,updated_at FROM revision_due_items WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`);
 const historyBefore=count(`SELECT COUNT(*) n FROM progress_events WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`);
 const invalidBefore=count(`SELECT COUNT(*) n FROM progress_events WHERE user_id=${sqlLiteral(normalId)}`);
 const invalid=await req('/api/progress',{method:'POST',body:{action:'set_stage',chapterId:'00000000-0000-0000-0000-000000000000',stage:'completed',enabled:true}}); const invalidAfter=count(`SELECT COUNT(*) n FROM progress_events WHERE user_id=${sqlLiteral(normalId)}`);
 record('progress invalid chapter rejected without D1 mutation',!invalid.ok&&invalidBefore===invalidAfter?'passed':'failed',`HTTP ${invalid.status}; events ${invalidBefore}->${invalidAfter}`);
 const guest=await req('/api/progress',{method:'POST',who:'guest',body:{action:'set_stage',chapterId:fixture.chapter_id,stage:'completed',enabled:true}}); record('progress guest mutation rejected',guest.status===401?'passed':'failed',`HTTP ${guest.status}`);

 const stages=['completed','revision_1','revision_2','test_1','test_2']; const eventIds=[];
 for(const stage of stages){const r=await req('/api/progress',{method:'POST',body:{action:'set_stage',chapterId:fixture.chapter_id,stage,enabled:true}}); await assertHttp(`progress set ${stage}`,r,[200]); if(r.data?.event_id){eventIds.push(r.data.event_id);observed.push(r.data.event_id);} const col={completed:'completed_at',revision_1:'revision_1_at',revision_2:'revision_2_at',test_1:'test_1_at',test_2:'test_2_at'}[stage]; record(`progress ${stage} D1 evidence`,Boolean(one(`SELECT ${col} v FROM chapter_progress WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`)?.v)?'passed':'failed',`${col} set`);}
 const clear=await req('/api/progress',{method:'POST',body:{action:'set_stage',chapterId:fixture.chapter_id,stage:'test_2',enabled:false}}); await assertHttp('progress clear stage',clear,[200]); const clearId=clear.data?.event_id; if(clearId){eventIds.push(clearId);observed.push(clearId);} record('progress clear D1 evidence',!one(`SELECT test_2_at v FROM chapter_progress WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`)?.v?'passed':'failed','test_2_at cleared');
 if(clearId){const undo=await req('/api/progress',{method:'POST',body:{action:'undo',eventId:clearId}}); await assertHttp('progress undo',undo,[200]); if(undo.data?.event_id){eventIds.push(undo.data.event_id);observed.push(undo.data.event_id);} record('progress undo D1 evidence',Boolean(one(`SELECT test_2_at v FROM chapter_progress WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`)?.v)&&one(`SELECT undone_at FROM progress_events WHERE id=${sqlLiteral(clearId)}`)?.undone_at?'passed':'failed','clear event marked undone and stage restored');}
 const historyAfter=count(`SELECT COUNT(*) n FROM progress_events WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`);
 record('progress history evidence',historyAfter>historyBefore?'passed':'failed',`history ${historyBefore}->${historyAfter}; generated=${eventIds.length}`);
}

async function restoreSideEffects(){
 if(readBefore){remote(`INSERT INTO channel_read_state(channel_id,user_id,last_read_sequence,last_read_at,updated_at) VALUES(${sqlLiteral(readBefore.channel_id)},${sqlLiteral(readBefore.user_id)},${sqlLiteral(readBefore.last_read_sequence)},${sqlLiteral(readBefore.last_read_at)},${sqlLiteral(readBefore.updated_at)}) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_sequence=excluded.last_read_sequence,last_read_at=excluded.last_read_at,updated_at=excluded.updated_at`);} else if(fixture&&normalId){remote(`DELETE FROM channel_read_state WHERE channel_id=${sqlLiteral(fixture.channel_id)} AND user_id=${sqlLiteral(normalId)}`);}
 if(progressBefore)remote(buildProgressRestoreSql(progressBefore));
 if(fixture&&normalId){const current=remote(`SELECT id FROM revision_due_items WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)}`); const baseline=new Set(revisionDueBefore.map(r=>r.id)); for(const r of current){if(!baseline.has(r.id))exactRowDelete('revision_due_items',r.id);} for(const r of revisionDueBefore){remote(`INSERT INTO revision_due_items(id,user_id,chapter_id,revision_number,source_completed_at,due_at,manual_due_at,status,completed_at,created_at,updated_at) VALUES(${['id','user_id','chapter_id','revision_number','source_completed_at','due_at','manual_due_at','status','completed_at','created_at','updated_at'].map(k=>sqlLiteral(r[k])).join(',')}) ON CONFLICT(id) DO UPDATE SET source_completed_at=excluded.source_completed_at,due_at=excluded.due_at,manual_due_at=excluded.manual_due_at,status=excluded.status,completed_at=excluded.completed_at,updated_at=excluded.updated_at`);}}
}

function markdown(report){return `# Phase 3 mutation/auth matrix\n\n- Result: **${report.status}**\n- Run: \`${report.workflowRun}\`\n- Commit: \`${report.commit}\`\n- Marker: \`${report.marker}\`\n- D1: \`${report.database}\`\n\n| Check | Status | Required | Evidence |\n|---|---|---|---|\n${report.checks.map(c=>`| ${c.name} | ${c.status} | ${c.required?'yes':'no'} | ${c.evidence.replaceAll('|','\\|')} |`).join('\n')}\n`}

await mkdir(REPORT_DIRECTORY,{recursive:true});
for(const name of REQUIRED)record(`environment:${name}`,process.env[name]?'passed':'failed',process.env[name]?'configured':'missing');
let cleanupResults=[]; let restoreError=null;
try{
 normalId=await viewer('mutation user','normal'); moderatorId=await viewer('moderator','moderator');
 if(normalId&&moderatorId)record('independent test identities',normalId!==moderatorId?'passed':'failed',normalId!==moderatorId?'different stable IDs':'same stable ID');
 if(normalId&&moderatorId){const n=one(`SELECT role,account_state FROM app_users WHERE user_id=${sqlLiteral(normalId)}`);const m=one(`SELECT role,account_state FROM app_users WHERE user_id=${sqlLiteral(moderatorId)}`);record('mutation user D1 identity',n?.account_state==='active'?'passed':'failed',`role=${n?.role||'missing'}; active=${n?.account_state==='active'}`);record('moderator privileged D1 identity',['moderator','admin','owner','parent_owner'].includes(m?.role)&&m?.account_state==='active'?'passed':'failed',`role=${m?.role||'missing'}; active=${m?.account_state==='active'}`);}
 if(normalId&&moderatorId){fixture=discover();record('dynamic academic/community fixture','passed',`level=${fixture.ca_level}; group=${fixture.group_code}; subject=${fixture.subject_title}; chapter=${fixture.chapter_key}; channel=${fixture.channel_slug}`); await communityMatrix(); await noteAndResourceMatrix(); await plannerMatrix(); await progressMatrix();}
}catch(e){record('phase 3 runner exception','failed',e instanceof Error?e.message:e);}
finally{
 try{cleanupResults=await cleanup.run(); const failed=cleanupResults.filter(x=>x.status!=='passed'); record('guaranteed exact-ID cleanup',failed.length?'failed':'passed',`captured=${cleanupResults.length}; failures=${failed.length}`);}catch(e){record('guaranteed exact-ID cleanup','failed',e instanceof Error?e.message:e);}
 try{await restoreSideEffects(); record('state restoration','passed','channel read/progress/revision-due state restored without deleting progress history');}catch(e){restoreError=e;record('state restoration','failed',e instanceof Error?e.message:e);}
 if(progressBefore&&fixture&&normalId&&!restoreError){const row=one(`SELECT user_id,chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,created_at,updated_at FROM chapter_progress WHERE user_id=${sqlLiteral(normalId)} AND chapter_id=${sqlLiteral(fixture.chapter_id)} LIMIT 1`);const now=normalizeProgressSnapshot(normalId,fixture.chapter_id,row);record('progress current-state post-cleanup verification',JSON.stringify(progressSnapshotComparable(now))===JSON.stringify(progressSnapshotComparable(progressBefore))?'passed':'failed','current progress state matches pre-run snapshot; progress_events intentionally retained');}
}
const preliminary={schemaVersion:1,phase:'phase-3-mutation-auth-matrix',generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||'local',workflowRun:process.env.GITHUB_RUN_ID||'local',target:BASE,database:DB,marker,checks};
const raw=JSON.stringify(preliminary);const leaked=sensitive.find(s=>s.length>=4&&raw.includes(s))||observed.find(s=>s.length>=4&&raw.includes(s))||(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)?'email':null); record('report privacy scan',leaked?'failed':'passed',leaked?'sensitive value detected':'no configured secret, raw observed ID, or email appears in report');
const failures=checks.filter(c=>c.required&&c.status!=='passed');const report={...preliminary,status:failures.length?'failed':'passed',summary:{passed:checks.filter(c=>c.status==='passed').length,failed:checks.filter(c=>c.status==='failed').length,unsupported:checks.filter(c=>c.status==='unsupported').length},checks};
await writeFile(`${REPORT_DIRECTORY}/mutation-matrix.json`,JSON.stringify(report,null,2)+'\n'); await writeFile(`${REPORT_DIRECTORY}/mutation-matrix.md`,markdown(report));
console.log(`Phase 3 mutation/auth matrix: ${report.status}; ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.unsupported} unsupported.`); if(report.status!=='passed')process.exitCode=1;
