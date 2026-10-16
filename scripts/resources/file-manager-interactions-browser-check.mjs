import {chromium} from 'playwright';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';
const server=http.createServer((request,response)=>{const file=request.url?.startsWith('/app.js')?'app.js':'index.html';response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');response.end(fs.readFileSync('/tmp/resources-phase1-preview/'+file));});let browser;
try{
 await new Promise(resolve=>server.listen(8768,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});const errors=[];page.on('pageerror',error=>errors.push(error.message));const mutations=[];let failNextMove=false;
  const folders=[{id:'target',name:'Destination',parent_id:null,kind:'folder'},{id:'source',name:'Source folder',parent_id:null,kind:'folder'},{id:'empty',name:'Empty folder',parent_id:null,kind:'folder'}];
  const files=Array.from({length:4},(_,i)=>({key:`note:n${i}`,id:`n${i}`,name:`Revision ${i}`,filename:`Revision ${i}`,kind:'note',extension:'NOTE',size:null,modified:'2026-10-15T00:00:00Z',subjectIds:[],subject:'Unfiled',chapterId:null,chapter:null,owner:'alice',status:'private',important:false,canManage:true,visibility:'private',excerpt:'Study fixture',href:`/notes/n${i}`,folderId:null}));
  await page.route('**/api/v1/resources/workspace**',async route=>{
   const request=route.request();if(request.method()==='POST'){
    const body=request.postDataJSON();mutations.push(body);if(body.action==='move'&&failNextMove){failNextMove=false;return route.fulfill({status:409,json:{error:'Fixture move conflict. Retry your move.'}});}
    if(body.action==='move')for(const key of body.keys)files.find(file=>file.key===key).folderId=body.folderId;
    if(body.action==='rename-folder')folders.find(folder=>folder.id===body.id).name=body.name;
    if(body.action==='delete-folder')folders.splice(folders.findIndex(folder=>folder.id===body.id),1);
    if(body.action==='move-folder')folders.find(folder=>folder.id===body.id).parent_id=body.folderId;
    return route.fulfill({json:{results:(body.keys??[]).map(key=>({key,ok:true}))}});
   }
   const url=new URL(request.url());if(url.searchParams.has('activity'))return route.fulfill({json:{activity:[],versions:[]}});
   const folder=url.searchParams.get('folder')||null;const visible=url.searchParams.get('view')==='folder'?files.filter(file=>file.folderId===folder):files;
   await route.fulfill({json:{files:visible,total:visible.length,nextCursor:null,folders,path:folder?folders.filter(item=>item.id===folder):[],trashFolders:[]}});
  });
  await page.goto('http://127.0.0.1:8768/');await page.evaluate(()=>{window.__dragEvents=[];for(const name of ['dragstart','drop','dragend'])document.addEventListener(name,event=>window.__dragEvents.push({type:name,target:event.target.closest('[data-file-key],[data-folder-target]')?.outerHTML.slice(0,160),types:Array.from(event.dataTransfer?.types??[])}),true);});const select=i=>page.getByRole('button',{name:`Select Revision ${i}`,exact:true});
  const sourceMenu=page.getByRole('button',{name:'Actions for folder Source folder',exact:true});await sourceMenu.click();
  const folderMenu=page.getByRole('menu',{name:'Folder actions',exact:true});await folderMenu.waitFor();
  let menuBounds=await folderMenu.boundingBox();assert.ok(menuBounds.x>=0&&menuBounds.x+menuBounds.width<=width&&menuBounds.y+menuBounds.height<=900,'folder menu stays in viewport');
  assert.equal(await folderMenu.getByRole('separator').count(),3,'folder actions are grouped');
  await page.screenshot({path:`/tmp/resources-phase1-preview/workspace-folder-menu-${width}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');await folderMenu.waitFor({state:'hidden'});assert.equal(await sourceMenu.evaluate(node=>node===document.activeElement),true,'folder menu returns focus');
  await page.locator('.fm-folder-open[data-folder-target="source"]').focus();await page.keyboard.press('Shift+F10');await folderMenu.waitFor();
  await folderMenu.getByRole('menuitem',{name:'Rename',exact:true}).click();const renameFolder=page.getByRole('dialog',{name:'Rename folder',exact:true});
  await renameFolder.getByRole('textbox',{name:'Name',exact:true}).fill('Renamed source');await renameFolder.getByRole('button',{name:'Save',exact:true}).click();await renameFolder.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Actions for folder Renamed source',exact:true}).waitFor();assert.equal(mutations.find(body=>body.action==='rename-folder').id,'source','folder rename targets the tile');
  const parentLocation=page.url();await page.getByRole('button',{name:'Actions for folder Empty folder',exact:true}).click();await folderMenu.getByRole('menuitem',{name:'Delete empty folder',exact:true}).click();
  const deleteFolder=page.getByRole('dialog',{name:'Delete empty folder',exact:true});await deleteFolder.waitFor();assert.equal(mutations.filter(body=>body.action==='delete-folder').length,0,'folder delete requires confirmation');
  await deleteFolder.getByRole('button',{name:'Delete empty folder',exact:true}).click();await deleteFolder.waitFor({state:'hidden'});await page.getByRole('button',{name:'Actions for folder Empty folder',exact:true}).waitFor({state:'hidden'});
  assert.equal(mutations.find(body=>body.action==='delete-folder').id,'empty');assert.equal(page.url(),parentLocation,'deleting a child retains current location');
  await select(0).click();assert.equal(await page.getByRole('dialog').count(),0,'single click selects');assert.equal(await select(0).getAttribute('aria-pressed'),'true');
  await select(1).click({modifiers:['Control']});assert.equal(await select(0).getAttribute('aria-pressed'),'true');assert.equal(await select(1).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.getByRole('button',{name:'List view',exact:true}).click();await select(0).click();await select(1).click({modifiers:['Control']});
  if(width>=600){await page.locator('[data-file-key="note:n3"] .fm-file-date').click();assert.equal(await select(3).getAttribute('aria-pressed'),'true','metadata belongs to the selectable row');assert.equal(await select(0).getAttribute('aria-pressed'),'false');}
  await page.getByRole('button',{name:'Actions for Revision 3',exact:true}).click();await page.getByRole('menu',{name:'File actions'}).waitFor();await page.getByRole('button',{name:'Actions for Revision 3',exact:true}).click();assert.equal(await page.getByRole('menu').count(),0,'menu trigger toggles without reopening');await page.getByRole('button',{name:'Actions for Revision 3',exact:true}).click();await page.getByRole('menu').waitFor();await page.setViewportSize({width:width+1,height:900});await page.getByRole('menu').waitFor({state:'hidden'});await page.setViewportSize({width,height:900});
  await select(0).click();await select(1).click({modifiers:['Control']});
  await select(0).click({button:'right'});let menu=page.getByRole('menu',{name:'File actions'});await menu.waitFor();assert.equal(await menu.getByRole('menuitem',{name:'Rename',exact:true}).count(),0,'multi context preserves selection');
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Actions for Revision 0'}).evaluate(node=>node===document.activeElement),true);
  await select(3).click({button:'right'});await menu.waitFor();await page.keyboard.press('F2');await page.getByRole('dialog',{name:'Rename file',exact:true}).waitFor();await page.keyboard.press('Escape');
  await select(3).click({button:'right'});await menu.waitFor();assert.equal(await select(0).getAttribute('aria-pressed'),'false');await menu.getByRole('menuitem',{name:'Rename',exact:true}).waitFor();
  await page.keyboard.press('Home');assert.equal(await menu.getByRole('menuitem',{name:'Open',exact:true}).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('End');assert.equal(await menu.getByRole('menuitem',{name:'Move to Trash',exact:true}).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Escape');
  await select(0).click();await select(2).click({modifiers:['Shift']});for(const i of [0,1,2])assert.equal(await select(i).getAttribute('aria-pressed'),'true');await select(1).click({modifiers:['Shift']});assert.equal(await select(2).getAttribute('aria-pressed'),'false','reversing a range shrinks it');
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.getByRole('checkbox',{name:'Select Revision 0',exact:true}).check();await page.getByRole('checkbox',{name:'Select Revision 2',exact:true}).click({modifiers:['Shift']});assert.equal(await page.getByRole('checkbox',{name:'Select Revision 1',exact:true}).isChecked(),true);await page.getByRole('button',{name:'Clear selection',exact:true}).click();await select(0).focus();await page.keyboard.press('Space');assert.equal(await select(0).getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Shift+F10');await menu.waitFor();await menu.getByRole('menuitem',{name:'File details',exact:true}).click();const inspector=page.getByRole(width>=1000?'region':'dialog',{name:'File details',exact:true});await inspector.waitFor();await page.keyboard.press('Escape');await inspector.waitFor({state:'hidden'});
  await select(0).focus();await page.keyboard.press('End');assert.equal(await select(3).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Home');assert.equal(await select(0).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('PageDown');assert.equal(await select(3).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('PageUp');assert.equal(await select(0).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__lastRoute==='/notes/n0');
  await select(1).dblclick();await page.waitForFunction(()=>window.__lastRoute==='/notes/n1');
  if(await page.getByRole('button',{name:'Clear selection',exact:true}).isVisible())await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.locator('.fm-filter-menu>summary').click();await page.getByRole('button',{name:'Folders',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();await select(0).click();await select(1).click({modifiers:['Control']});
  await page.locator('[data-file-key="note:n0"]').dragTo(page.locator('.fm-real-folders [data-folder-target="target"]'));
  await page.waitForFunction(()=>document.querySelectorAll('[data-file-key]').length===2).catch(async error=>{throw new Error('File drag failed: '+JSON.stringify({mutations,ui:await page.evaluate(()=>({events:window.__dragEvents,alerts:Array.from(document.querySelectorAll('[role=alert],[role=status]')).map(node=>node.textContent),files:document.querySelectorAll('[data-file-key]').length})),errors})+' '+error.message);});
  const move=mutations.find(body=>body.action==='move');assert.deepEqual([...move.keys].sort(),['note:n0','note:n1']);assert.equal(move.folderId,'target');
  await select(2).click();failNextMove=true;await page.locator('[data-file-key="note:n2"]').dragTo(page.locator('.fm-real-folders [data-folder-target="target"]'));
  await page.getByRole('alert').filter({hasText:'Fixture move conflict'}).waitFor();assert.equal(await select(2).getAttribute('aria-pressed'),'true','failed move keeps source selected');
  await page.getByRole('button',{name:'Move',exact:true}).click();await page.getByRole('dialog',{name:'Move to folder'}).waitFor();await page.keyboard.press('Escape');
  // A source folder cannot be dropped onto itself, including synthetic forged destinations.
  await page.locator('.fm-real-folders [data-folder-target="source"]').evaluate(node=>{const transfer=new DataTransfer();node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));window.__dragTransfer=transfer;});
  await page.locator('.fm-real-folders [data-folder-target="source"]').evaluate(node=>node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__dragTransfer})));
  await page.getByRole('alert').filter({hasText:'itself or its children'}).waitFor();assert.equal(mutations.filter(body=>body.action==='move-folder').length,0);
  await page.locator('.fm-real-folders [data-folder-target="source"]').evaluate(node=>{const transfer=new DataTransfer();node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));const payload=JSON.parse(transfer.getData('application/x-ca-progress-workspace+json'));payload.ownerId='bob';transfer.setData('application/x-ca-progress-workspace+json',JSON.stringify(payload));window.__dragTransfer=transfer;});
  await page.locator('.fm-real-folders [data-folder-target="target"]').evaluate(node=>node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__dragTransfer})));
  await page.getByRole('alert').filter({hasText:'drag has expired'}).waitFor();assert.equal(mutations.filter(body=>body.action==='move-folder').length,0);
  await page.locator('.fm-real-folders [data-folder-target="source"]').dragTo(page.locator('.fm-real-folders [data-folder-target="target"]'));
  await page.waitForFunction(()=>!document.querySelector('.fm-real-folders [data-folder-target="source"]'));assert.equal(mutations.find(body=>body.action==='move-folder').folderId,'target');
  // Real external File objects are staged in the simple picker, not uploaded immediately.
  await page.locator('.fm-server-workspace').evaluate(node=>{const transfer=new DataTransfer();transfer.items.add(new File(['fixture bytes'],'dragged.pdf',{type:'application/pdf'}));node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
  const upload=page.getByRole('dialog',{name:'Upload files'});await upload.waitFor();await upload.getByText('dragged.pdf',{exact:false}).waitFor();assert.equal(await upload.getByRole('button',{name:'Upload selected files'}).isEnabled(),true);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(errors,[]);console.log(`PASS selection/context menus/keyboard/touch/internal file+folder drag/external upload staging at ${width}px`);await page.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
