import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
const server=http.createServer((request,response)=>{const file=request.url?.startsWith('/app.js')?'app.js':'index.html';response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');response.end(fs.readFileSync('/tmp/resources-phase1-preview/'+file));});
let browser;
try{
 await new Promise(resolve=>server.listen(8767,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const folders=[{id:'parent',name:'Parent',parent_id:null},{id:'child',name:'Child',parent_id:'parent'}];
  await page.route('**/api/v1/resources/workspace**',async route=>{
   const url=new URL(route.request().url());const folder=url.searchParams.get('folder')??'';
   if(url.searchParams.has('activity'))return route.fulfill({json:{activity:[],versions:[]}});
   const file={key:'note:n',id:'n',name:'Revision',filename:'Revision',kind:'note',extension:'NOTE',size:null,modified:'2026-10-15T00:00:00Z',subjectIds:[],subject:'Unfiled',chapterId:null,chapter:null,owner:'alice',status:'private',important:false,canManage:true,visibility:'private',excerpt:'Study fixture',href:'/notes/n',folderId:folder||null};
   await route.fulfill({json:{files:[file],total:1,nextCursor:null,folders,path:folder==='child'?folders:folder==='parent'?[folders[0]]:[],trashFolders:[]}});
  });
  await page.goto('http://127.0.0.1:8767/');
  if(await page.getByRole('button',{name:'Clear selection',exact:true}).isVisible())await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.locator('.fm-filter-menu>summary').click();await page.getByRole('button',{name:'Folders',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.locator('.fm-real-folders').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('fmView'),'folder');
  await page.getByRole('button',{name:'Parent',exact:true}).click();
  await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Parent',exact:true}).waitFor();
  await page.getByRole('button',{name:'Child',exact:true}).click();
  await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Child',exact:true}).waitFor();
  const path=page.getByRole('navigation',{name:'Folder path'});
  assert.equal(await path.getByRole('button').count(),3);
  await page.goBack();await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Parent',exact:true}).waitFor();
  await page.goForward();await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Child',exact:true}).waitFor();
  if(width<=800)await page.getByRole('button',{name:'Search resources',exact:true}).click();const search=page.getByRole('textbox',{name:'Search files',exact:true});await search.fill('revision tax');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('fm_query')==='revision tax');
  assert.equal(await search.evaluate(node=>node===document.activeElement),true,'typing must not remount the manager');
  if(width<=800)await page.getByRole('button',{name:'Close search',exact:true}).click();await page.getByRole('button',{name:'List view',exact:true}).click();
  await page.reload();await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Child',exact:true}).waitFor();
  if(width<=800)await page.getByRole('button',{name:'Search resources',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Search files',exact:true}).inputValue(),'revision tax');
  if(width<=800)await page.getByRole('button',{name:'Close search',exact:true}).click();assert.equal(await page.getByRole('button',{name:'List view',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('checkbox',{name:'Select Revision',exact:true}).check();
  await page.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'Resources',exact:true}).click();
  await page.locator('.fm-breadcrumbs button[aria-current=page]').filter({hasText:'Resources'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Clear selection',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);console.log(`PASS navigation/back/forward/reload/search focus/layout/selection reset at ${width}px`);
  await page.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
