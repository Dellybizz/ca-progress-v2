import type {WorkspacePage} from './workspace';
/** Project only organization state; source content and permission flags remain untouched. */
export function projectWorkspaceOperation(page:WorkspacePage,body:Record<string,unknown>,view:string,folder:string):WorkspacePage{
 const next=structuredClone(page);const action=String(body.action),keys=Array.isArray(body.keys)?body.keys:[];const at=typeof body.offlineOccurredAt==='string'?body.offlineOccurredAt:new Date().toISOString();
 for(const file of next.files){if(!keys.includes(file.key))continue;if(action==='move')file.folderId=String(body.folderId??'')||null;if(action==='star')file.starred=body.starred===true;if(action==='trash'){file.trashedAt=at;file.trashExpiresAt=new Date(Date.parse(at)+30*86400000).toISOString();}if(action==='restore'){file.trashedAt=null;file.trashExpiresAt=null;}}
 const oldLength=next.files.length;next.files=next.files.filter(file=>(view==='trash'?Boolean(file.trashedAt):!file.trashedAt)&&(view!=='starred'||file.starred)&&(view!=='folder'||file.folderId===(folder||null)));next.total=Math.max(0,next.total-oldLength+next.files.length);
 const id=String(body.id??body.clientId??'');const f=next.folders.find(item=>item.id===id);
 if(action==='create-folder'&&!f)next.folders.push({id,name:String(body.name),parent_id:String(body.folderId??'')||null,kind:body.kind==='notebook'||body.kind==='section'?body.kind:'folder'});
 if(f&&action==='rename-folder')f.name=String(body.name);
 if(f&&action==='move-folder')f.parent_id=String(body.folderId??'')||null;
 if(f&&action==='delete-folder'){next.folders=next.folders.filter(item=>item.id!==id);next.trashFolders=[...(next.trashFolders??[]),{...f,trashed_at:at,trash_expires_at:new Date(Date.parse(at)+30*86400000).toISOString()}];}
 if(action==='restore-folder'){const restored=next.trashFolders?.find(item=>item.id===id);if(restored){next.folders.push({...restored,parent_id:next.folders.some(item=>item.id===restored.parent_id)?restored.parent_id:null,trashed_at:null,trash_expires_at:null});next.trashFolders=next.trashFolders?.filter(item=>item.id!==id);}}
 return next;
}
