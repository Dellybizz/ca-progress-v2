import type {FileKind,FileSort,ManagedFile} from './file-manager';

/** Serializable filter contract shared by renderers and the workspace controller. */
export type ManagerQuery={query:string;types:FileKind[];sort:FileSort;secondary:FileSort|'none';direction:'asc'|'desc';subjectId:string;chapterId:string;important:boolean;limit:number;group:'none'|'type'|'subject';tag?:string;status?:string;owner?:string;after?:string;before?:string};
export const FILE_LAYOUTS=['grid','list','compact'] as const;
export type FileLayout=typeof FILE_LAYOUTS[number];
export const INTERNAL_FILE_DRAG_TYPE='application/x-ca-progress-workspace+json';
export type WorkspaceAction='open'|'details'|'move'|'rename'|'tag'|'star'|'trash'|'restore'|'erase'|'duplicate'|'replace-version'|'share';
export type ActionContext={collection:'my'|'shared'|'official';online:boolean;preview?:boolean};
/** UI eligibility only. The API must independently authorize every mutation. */
export function actionEligibility(action:WorkspaceAction,files:readonly ManagedFile[],context:ActionContext):{allowed:boolean;reason?:string}{
  if(!files.length)return{allowed:false,reason:'Select a file first.'};
  if(action==='details')return{allowed:files.length===1,reason:files.length===1?undefined:'Choose one file.'};
  if(action==='open')return{allowed:files.length===1&&!files[0].trashedAt,reason:files.length===1&&!files[0].trashedAt?undefined:'Choose one file outside Trash.'};
  if(context.preview||context.collection!=='my'||files.some(file=>!file.canManage))return{allowed:false,reason:'Only your own files can be changed here.'};
  const trashAction=action==='restore'||action==='erase';
  if(files.some(file=>Boolean(file.trashedAt)!==trashAction))return{allowed:false,reason:trashAction?'Choose files in Trash.':'Restore files before changing them.'};
  if(['rename','duplicate','replace-version'].includes(action)&&files.length!==1)return{allowed:false,reason:'Choose one file.'};
  if(['rename','duplicate','replace-version'].includes(action)&&files.some(file=>file.visibility!=='private'))return{allowed:false,reason:'This action requires a private original.'};
  if(action==='replace-version'&&files.some(file=>file.kind==='note'))return{allowed:false,reason:'Choose an uploaded file.'};
  if(!context.online&&['rename','tag','erase','duplicate','replace-version','share'].includes(action))return{allowed:false,reason:'This action needs a connection.'};
  if(action==='share'&&files.every(file=>file.visibility==='shared'))return{allowed:false,reason:'These files are already shared.'};
  return{allowed:true};
}

export type SelectionState={keys:string[];anchor:string|null;rangeBase?:string[]};
/** Preserve explicit additive choices while replacing the previous Shift range. */
export function toggleFileSelection(state:SelectionState,key:string,visible:readonly string[],range=false):SelectionState{
  const keys=state.keys.filter(id=>visible.includes(id));
  if(!visible.includes(key))return{keys,anchor:visible.includes(state.anchor??'')?state.anchor:null,rangeBase:(state.rangeBase??[]).filter(id=>visible.includes(id))};
  const start=visible.indexOf(state.anchor??''),end=visible.indexOf(key);
  if(range&&start>=0){const rangeBase=(state.rangeBase??[]).filter(id=>visible.includes(id));return{keys:[...new Set([...rangeBase,...visible.slice(Math.min(start,end),Math.max(start,end)+1)])],anchor:state.anchor,rangeBase};}
  const next=keys.includes(key)?keys.filter(id=>id!==key):[...keys,key];
  return{keys:next,anchor:key,rangeBase:next.filter(id=>id!==key)};
}

export type DragEntity={id:string;kind:'file'|'folder';parentId:string|null};
export type WorkspaceDrag={version:1;ownerId:string;scope:string;entities:DragEntity[]};
export function parseWorkspaceDrag(raw:string,ownerId:string,scope:string):WorkspaceDrag|null{
  if(raw.length>65536)return null;
  try{
    const value=JSON.parse(raw) as WorkspaceDrag;
    if(!value||value.version!==1||value.ownerId!==ownerId||!ownerId||value.scope!==scope||!scope||!Array.isArray(value.entities)||!value.entities.length||value.entities.length>96)return null;
    const seen=new Set<string>();
    for(const entity of value.entities){
      if(!entity||!['file','folder'].includes(entity.kind)||typeof entity.id!=='string'||!entity.id||entity.id.length>200||(entity.parentId!==null&&(typeof entity.parentId!=='string'||!entity.parentId||entity.parentId.length>200)))return null;
      const key=`${entity.kind}:${entity.id}`;if(seen.has(key))return null;seen.add(key);
    }
    return value;
  }catch{return null;}
}
export type DropFolder={id:string;parentId:string|null;trashed?:boolean};
/** Reject unknown hierarchy: never guess that an unexpanded destination is safe. */
export function moveDropEligibility(drag:WorkspaceDrag,destination:string|null,folders:readonly DropFolder[]):{allowed:boolean;reason?:string}{
  if(!drag.entities.length)return{allowed:false,reason:'No files to move.'};
  const byId=new Map(folders.map(folder=>[folder.id,folder]));
  const movingFolders=new Set(drag.entities.filter(entity=>entity.kind==='folder').map(entity=>entity.id));
  let parent=destination;const seen=new Set<string>();
  while(parent!==null){
    if(movingFolders.has(parent))return{allowed:false,reason:'A folder cannot be moved into itself or its children.'};
    const folder=byId.get(parent);
    if(!folder||folder.trashed||seen.has(parent))return{allowed:false,reason:'Choose an available folder in My files.'};
    seen.add(parent);parent=folder.parentId;
  }
  if(drag.entities.every(entity=>entity.parentId===destination))return{allowed:false,reason:'Already in this folder.'};
  return{allowed:true};
}
/** External file drops use the existing upload validation and queue, never URL/text drops. */
export function classifyWorkspaceDrop(types:readonly string[]):'internal'|'upload'|'unsupported'{
  if(types.includes(INTERNAL_FILE_DRAG_TYPE))return'internal';
  return types.includes('Files')?'upload':'unsupported';
}

export type WorkspaceLocation={collection:'my'|'shared'|'official';view:'all'|'folder'|'starred'|'recent'|'trash';folder:string;layout:FileLayout};
/** Location excludes cursors, selection, dialogs and transfers: those are transient state. */
export function normalizeWorkspaceLocation(value:Partial<WorkspaceLocation>):WorkspaceLocation{
  const collection=value.collection==='shared'||value.collection==='official'?value.collection:'my';
  const view=collection==='my'&&['folder','starred','recent','trash'].includes(value.view??'')?value.view!:'all';
  const folder=(view==='folder'||view==='trash')&&typeof value.folder==='string'?value.folder.slice(0,200):'';
  return{collection,view,folder,layout:FILE_LAYOUTS.includes(value.layout!)?value.layout!:'grid'};
}
export function workspaceLocationKey(ownerId:string,contextKey:string,location:WorkspaceLocation):string{
  return JSON.stringify([ownerId,contextKey,normalizeWorkspaceLocation(location)]);
}
