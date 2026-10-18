/** Prevent an older editor's HTML fallback from replacing extended graph data. */
export const HIERARCHY_EDITOR_CAPABILITY='hierarchy-node-geometry-v1';
export function requiresHierarchyEditor(value:unknown):boolean{
 if(!value||typeof value!=='object')return false;
 const document=value as {content?:unknown;type?:unknown;attrs?:{data?:unknown};engine?:unknown};
 if(document.type==='diagram'&&typeof document.attrs?.data==='string')try{const model=JSON.parse(document.attrs.data);if(model?.type==='graph'&&Array.isArray(model.nodes)&&model.nodes.some((node:object)=>node&&['width','height','fontSize','textAlign','locked'].some(key=>Object.hasOwn(node,key))))return true;}catch{}
 if(Array.isArray(document.content))return document.content.some(requiresHierarchyEditor);
 return document.content!==undefined&&requiresHierarchyEditor(document.content);
}
export function hierarchyWriteNeedsReload(previous:unknown,capabilities:unknown){return requiresHierarchyEditor(previous)&&(!Array.isArray(capabilities)||!capabilities.includes(HIERARCHY_EDITOR_CAPABILITY));}

/** Older clients cannot flatten independent accounts or discard calculation membership. */
export const ACCOUNTING_EDITOR_CAPABILITY='accounting-workings-v1';
export function requiresAccountingEditor(value:unknown):boolean{
 if(!value||typeof value!=='object')return false;
 const n=value as {type?:unknown;attrs?:Record<string,unknown>;content?:unknown};
 if(n.type==='account'||n.attrs&&(n.attrs.caTotal||n.attrs.caSection||n.attrs.caColRole))return true;
 if(typeof n.attrs?.caFormat==='string')try{if(JSON.parse(n.attrs.caFormat).workings===1)return true;}catch{}
 return Array.isArray(n.content)?n.content.some(requiresAccountingEditor):requiresAccountingEditor(n.content);
}
export function accountingWriteNeedsReload(previous:unknown,capabilities:unknown){return requiresAccountingEditor(previous)&&(!Array.isArray(capabilities)||!capabilities.includes(ACCOUNTING_EDITOR_CAPABILITY));}

export const WORKING_NOTES_CAPABILITY='linked-working-notes-v1';
export function requiresWorkingNotesEditor(value:unknown):boolean{if(!value||typeof value!=='object')return false;const n=value as {type?:unknown;attrs?:{workingTarget?:unknown};content?:unknown};return n.type==='workingNote'||!!n.attrs?.workingTarget||(Array.isArray(n.content)?n.content.some(requiresWorkingNotesEditor):requiresWorkingNotesEditor(n.content));}
export function workingNotesWriteNeedsReload(previous:unknown,capabilities:unknown){return requiresWorkingNotesEditor(previous)&&(!Array.isArray(capabilities)||!capabilities.includes(WORKING_NOTES_CAPABILITY));}
