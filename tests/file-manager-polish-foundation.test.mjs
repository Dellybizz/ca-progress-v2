import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/resources/workspace-foundation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const f=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const file=(extra={})=>({key:'upload:a',canManage:true,trashedAt:null,...extra});
const context={collection:'my',online:true};
test('action rules reject mixed ownership, read-only collections and incompatible Trash selections',()=>{
 for(const action of ['move','rename','tag','star','trash','restore','erase']){
  assert.equal(f.actionEligibility(action,[file(),file({canManage:false})],context).allowed,false);
  assert.equal(f.actionEligibility(action,[file()],{...context,collection:'shared'}).allowed,false);
 }
 assert.equal(f.actionEligibility('tag',[file(),file()],context).allowed,true);
 assert.equal(f.actionEligibility('move',[file(),file({trashedAt:'now'})],context).allowed,false);
 assert.equal(f.actionEligibility('restore',[file({trashedAt:'now'})],context).allowed,true);
 assert.equal(f.actionEligibility('move',[file()],{...context,online:false}).allowed,true);
 assert.equal(f.actionEligibility('erase',[file({trashedAt:'now'})],{...context,online:false}).allowed,false);
});
test('successive range selections retain anchor and prune unloaded files',()=>{
 const visible=['a','b','c','d'];let state=f.toggleFileSelection({keys:['stale'],anchor:null},'b',visible);
 state=f.toggleFileSelection(state,'d',visible,true);assert.deepEqual(state,{keys:['b','c','d'],anchor:'b',rangeBase:[]});
 state=f.toggleFileSelection(state,'a',visible,true);assert.equal(state.anchor,'b');assert.deepEqual(state.keys,['a','b']);
 assert.deepEqual(f.toggleFileSelection(state,'missing',['c']),{keys:[],anchor:null,rangeBase:[]});
});
const drag={version:1,ownerId:'alice',scope:'academic-a',entities:[{kind:'folder',id:'parent',parentId:null}]};
test('internal drag payload is bounded and scoped to owner and academic context',()=>{
 const parse=value=>f.parseWorkspaceDrag(JSON.stringify(value),'alice','academic-a');
 assert.deepEqual(parse(drag),drag);
 for(const bad of [{...drag,ownerId:'bob'},{...drag,scope:'academic-b'},{...drag,version:2},{...drag,entities:[]},{...drag,entities:[...drag.entities,...drag.entities]},{...drag,entities:[{id:'a',kind:'url',parentId:null}]}])assert.equal(parse(bad),null);
 assert.equal(f.parseWorkspaceDrag('{','alice','academic-a'),null);
 assert.equal(f.parseWorkspaceDrag('x'.repeat(65537),'alice','academic-a'),null);
});
test('drop destinations reject cycles, missing hierarchy, Trash and no-op moves',()=>{
 const folders=[{id:'parent',parentId:null},{id:'child',parentId:'parent'},{id:'target',parentId:null},{id:'trash',parentId:null,trashed:true},{id:'loop',parentId:'loop'}];
 for(const destination of ['parent','child','missing','trash','loop',null])assert.equal(f.moveDropEligibility(drag,destination,folders).allowed,false);
 assert.equal(f.moveDropEligibility(drag,'target',folders).allowed,true);
 assert.equal(f.moveDropEligibility({...drag,entities:[{kind:'file',id:'a',parentId:'parent'}]},null,folders).allowed,true);
});
test('file drops are distinct from internal moves and untrusted text or links',()=>{
 assert.equal(f.classifyWorkspaceDrop(['Files']),'upload');
 assert.equal(f.classifyWorkspaceDrop(['Files',f.INTERNAL_FILE_DRAG_TYPE]),'internal');
 assert.equal(f.classifyWorkspaceDrop(['text/uri-list','text/plain']),'unsupported');
});
test('canonical location clears incompatible folders and separates owner cache identity',()=>{
 assert.deepEqual(f.normalizeWorkspaceLocation({collection:'shared',view:'folder',folder:'private',layout:'compact'}),{collection:'shared',view:'all',folder:'',layout:'compact'});
 const location=f.normalizeWorkspaceLocation({view:'folder'});assert.equal(location.view,'folder');
 assert.notEqual(f.workspaceLocationKey('alice','ctx',location),f.workspaceLocationKey('bob','ctx',location));
 assert.notEqual(f.workspaceLocationKey('alice','ctx',location),f.workspaceLocationKey('alice','ctx2',location));
});
test('duplicate and version actions obey the same single-item and offline gates as menus',()=>{
 assert.equal(f.actionEligibility('duplicate',[file(),file()],context).allowed,false);
 assert.equal(f.actionEligibility('duplicate',[file()],{...context,online:false}).allowed,false);
 assert.equal(f.actionEligibility('replace-version',[file({kind:'note'})],context).allowed,false);
 assert.equal(f.actionEligibility('replace-version',[file({kind:'pdf'})],context).allowed,true);
 assert.equal(f.actionEligibility('rename',[file(),file()],context).allowed,false);
});
test('selection uses entity keys for duplicate filenames and never retains unloaded pages',()=>{
 const first=f.toggleFileSelection({keys:[],anchor:null},'note:one',['note:one','note:two']);
 const both=f.toggleFileSelection(first,'note:two',['note:one','note:two']);assert.deepEqual(both.keys,['note:one','note:two']);
 const next=f.toggleFileSelection(both,'upload:one',['upload:one']);assert.deepEqual(next,{keys:['upload:one'],anchor:'upload:one',rangeBase:[]});
});
