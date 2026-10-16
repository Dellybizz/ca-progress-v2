import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const server=http.createServer((req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync('/tmp/resources-phase1-preview/'+file));});let browser,page;
try{
 await new Promise(resolve=>server.listen(8770,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [1440,390]){
  page=await browser.newPage({viewport:{width,height:900}});let repairs=0;const blockedRequests=[];const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const files=['picture','blocked','unsupported'].map((id,index)=>({key:'upload:'+id,id,name:index===0?'Image screenshot':index===1?'Review required — Advanced Accounting consolidated revision notes for the final examination with a very long filename.png':'Unsupported image',filename:id+'.png',kind:'image',extension:'PNG',size:1024,modified:'2026-10-15T00:00:00Z',subjectIds:[],subject:'Unfiled',chapterId:null,chapter:null,owner:'alice',status:'private',important:false,canManage:true,visibility:'private',excerpt:'',href:'/resources/'+id,folderId:null,trashedAt:null,processingState:['queued','quarantined','unsupported'][index],thumbnailMissing:true,previewUrl:'/api/resources/'+id+'/preview'}));
  await page.route('**/api/v1/resources/workspace**',route=>route.fulfill({json:{files,total:3,nextCursor:null,folders:[],path:[],trashFolders:[]}}));
  await page.route('**/api/resources/*/preview**',async route=>{const url=new URL(route.request().url());if(!url.pathname.includes('/picture/')){blockedRequests.push(url.pathname);return route.fulfill({status:423});}if(route.request().method()==='POST'){repairs++;assert.equal(route.request().headers()['x-source-sha256'],'1'.repeat(64));assert.ok(route.request().postDataBuffer().length<=180000);return route.fulfill({json:{ok:true}});}if(url.searchParams.get('text'))return route.fulfill({json:{state:'ready',hasThumbnail:false,sourceHash:'1'.repeat(64)}});return route.fulfill({contentType:'image/png',body:png});});
  await page.goto('http://127.0.0.1:8770/');await page.getByRole('button',{name:'Select Image screenshot',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.fm-thumbnail.has-preview img')?.naturalWidth>0);await page.waitForFunction(()=>!document.body.textContent.includes('Preparing preview'));
  for(let count=0;count<30&&!repairs;count++)await page.waitForTimeout(100);assert.equal(repairs,1,'missing owner thumbnail repaired once');assert.deepEqual(blockedRequests,[],'blocked images never requested');
  for(const card of await page.locator('.fm-files--grid .fm-file').all()){
   const header=await card.locator('.fm-file-copy').boundingBox(),preview=await card.locator('.fm-thumbnail').boundingBox(),menu=await card.locator('.fm-file-info').boundingBox();
   assert.ok(header.y+header.height<=preview.y+1,'filename header is above preview');assert.ok(menu.y>=header.y-1&&menu.y+menu.height<=preview.y+1,'menu stays in header');
   assert.equal(await card.locator('.fm-file-subject').isVisible(),false,'metadata stays out of grid');
   const title=card.locator('.fm-file-copy strong');assert.equal(await title.evaluate(node=>getComputedStyle(node).whiteSpace),'nowrap','long filenames remain one line');assert.ok((await title.boundingBox()).width>24,'filename keeps readable space');
  }
  await page.getByRole('button',{name:'Select Image screenshot',exact:true}).click();assert.equal(await page.locator('.fm-primary-action').count(),4);
  const more=page.getByRole('button',{name:'More actions',exact:true});await more.click();await page.getByRole('menuitem',{name:'Export file list',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('menu',{name:'File actions'}).waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.matches('.fm-more-actions'));assert.equal(await more.evaluate(node=>node===document.activeElement),true);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.locator('.fm-filter-menu>summary').click();await page.getByRole('dialog',{name:'Filter resources',exact:true}).waitFor();await page.locator('.fm-advanced-filters>summary').click();await page.getByRole('combobox',{name:'Group files by',exact:true}).waitFor();await page.getByRole('button',{name:'Apply',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow');
  await page.getByRole('button',{name:'Select Image screenshot',exact:true}).click();
  const target=await more.boundingBox();assert.ok(target.height>=(width===390?44:40),'readable touch targets');
  for(const badge of await page.locator('.fm-preview-unavailable').all()){const bounds=await badge.boundingBox(),parent=await badge.locator('..').boundingBox();assert.ok(bounds.x>=parent.x-1&&bounds.x+bounds.width<=parent.x+parent.width+1,'status stays inside preview');}
  assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/resources-phase1-preview/workspace-visual-${width}.png`,fullPage:false,animations:'disabled'});console.log('PASS polished file cards, real image load, bounded thumbnail repair, blocked images, compact actions, filters and overflow at '+width);await page.close();
 }
} catch(error){await page?.screenshot({path:'/tmp/resources-phase1-preview/workspace-visual-failure.png',fullPage:false,animations:'disabled'}).catch(()=>{});throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
