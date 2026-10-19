import assert from 'node:assert/strict';
/** Real pointer operations in the bundled authoring surface, not mocked editor commands. */
export async function checkInk(page,content,width){
 await content.click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Insert content',exact:true}).click();await page.getByRole('dialog',{name:'Insert content',exact:true}).getByRole('button',{name:'Handwriting',exact:true}).click();
 const ink=content.locator('.note-ink').last(),canvas=ink.locator('.note-ink-canvas');await ink.getByRole('textbox',{name:'Drawing label',exact:true}).fill('Editable annotation '+width);await ink.getByRole('textbox',{name:'Drawing label',exact:true}).press('Tab');
 const count=()=>canvas.locator('[data-ink-id]').count();
 const tool=async name=>{await ink.getByRole('button',{name,exact:true}).click();};
 async function gesture(points){await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();const p=([x,y])=>({x:b.x+x/1000*b.width,y:b.y+y/600*b.height});const first=p(points[0]);await page.mouse.move(first.x,first.y);await page.mouse.down();for(const xy of points.slice(1)){const n=p(xy);await page.mouse.move(n.x,n.y,{steps:5});}await page.mouse.up();}
 await tool('Pen');await gesture([[100,100],[180,110],[250,100]]);assert.equal(await count(),1);
 await tool('Highlighter');await ink.getByLabel('Ink colour',{exact:true}).fill('#facc15');await gesture([[100,200],[300,200]]);assert.equal(await count(),2);assert.equal(await canvas.locator('[data-ink-id]').last().getAttribute('opacity'),'0.28');
 await tool('Line');await gesture([[100,300],[350,300]]);await tool('Rectangle');await gesture([[500,80],[750,230]]);await tool('Ellipse');await gesture([[500,350],[750,500]]);assert.equal(await count(),5);
 await tool('Undo ink');assert.equal(await count(),4);await tool('Redo ink');assert.equal(await count(),5);
 await tool('Lasso');await gesture([[50,50],[300,50],[300,150],[50,150],[50,50]]);assert.match(await ink.locator('.note-ink-status').textContent(),/1 selected/);
 const before=await canvas.locator('[data-ink-id]').first().innerHTML();await gesture([[180,105],[210,135]]);assert.notEqual(await canvas.locator('[data-ink-id]').first().innerHTML(),before);await tool('Shrink selected ink');await tool('Enlarge selected ink');await canvas.focus();await page.keyboard.press('ArrowRight');assert.match(await ink.locator('.note-ink-status').textContent(),/1 selected/);
 await tool('Delete selected ink');assert.equal(await count(),4);await tool('Undo ink');assert.equal(await count(),5);
 await tool('Eraser');await gesture([[170,200],[180,200]]);assert.ok(await count()<5);await tool('Undo ink');assert.equal(await count(),5);
 await tool('Pen');await canvas.scrollIntoViewIfNeeded();let b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*.1,b.y+b.height*.8);await page.mouse.down();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.8);await canvas.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up();assert.equal(await count(),5,'cancelled gesture leaves saved ink unchanged');
 if(width===390){
  const session=await page.context().newCDPSession(page);
  async function touch(){await canvas.scrollIntoViewIfNeeded();b=await canvas.boundingBox();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.1,y:b.y+b.height*.9}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.3,y:b.y+b.height*.9}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await touch();assert.equal(await count(),5,'touch navigation does not draw in pen-only mode');await ink.getByRole('checkbox',{name:'Finger draw',exact:true}).check();await touch();assert.equal(await count(),6,'explicit finger mode draws');await ink.getByRole('checkbox',{name:'Finger draw',exact:true}).uncheck();await session.detach();
 }
 if(width===1440){
  const session=await page.context().newCDPSession(page);await canvas.scrollIntoViewIfNeeded();b=await canvas.boundingBox();
  await session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x+b.width*.1,y:b.y+b.height*.5,pointerType:'pen'});
  await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+b.width*.1,y:b.y+b.height*.5,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.2});
  await session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x+b.width*.2,y:b.y+b.height*.5,button:'left',buttons:1,pointerType:'pen',force:.8});
  await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+b.width*.3,y:b.y+b.height*.5,button:'left',buttons:0,clickCount:1,pointerType:'pen',force:0});
  assert.equal(await count(),6,'pen pointer draws with pressure');assert.ok(await canvas.locator('[data-ink-id]').last().locator('path').count()>=2,'pressure changes stroke width');await session.detach();
 }
 await ink.getByLabel('Drawing width' ,{exact:true}).selectOption('75');await ink.screenshot({path:`/tmp/note-studio-preview/notes-ink-${width}.png`,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 if(width===1440){const art=await canvas.innerHTML();await tool('Text');await content.locator('p').last().click();await page.keyboard.insertText(' Typed beside anchored handwriting.');assert.equal(await canvas.innerHTML(),art,'typing nearby preserves the ink anchor and geometry');}
 await tool('Text');assert.equal(await canvas.evaluate(n=>n.style.touchAction),'pan-y pinch-zoom');
 console.log('PASS anchored vector ink tools, lasso/move/resize, undo/redo, cancellation and touch modes '+width);
}
