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
