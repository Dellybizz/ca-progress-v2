/** Route legacy tool tests through the real context-menu entry point.
 * Assertions and document interactions remain unchanged; no application state is patched.
 */
export function installContextTools(page){
 const rawRole=page.getByRole.bind(page),rawLocator=page.locator.bind(page),rawLabel=page.getByLabel.bind(page),proxies=new WeakMap(),originals=new WeakMap();
 const roleWithContext=(owner,args)=>{const [role,options={}]=args;return owner.getByRole(role,options).or(owner.getByRole(role,{...options,includeHidden:true}).and(rawLocator('.note-editing-dock,.note-editing-dock *')));};
 const unwrap=value=>originals.get(value)??value;
 let preparing=false;
 const prepare=async(locator,dismissOutside)=>{
  if(preparing)return;await locator.waitFor({state:'attached'});if(await locator.count()!==1)return;
  preparing=true;
  try{
   const inside=await locator.evaluate(el=>({dock:!!el.closest('.note-editing-dock'),section:el.closest('[data-context-layout]')?'Position and size':el.closest('[data-context-content]')?'Appearance and content':null}));
   const menu=rawRole('dialog',{name:'Selected content options',exact:true});
   if(inside.dock){
    if(!await menu.isVisible()){await rawLocator('.note-document').evaluate(el=>el.editor.view.focus());await page.keyboard.press('Shift+F10');await menu.waitFor({state:'visible'});}
    if(inside.section){const summary=menu.getByText(inside.section,{exact:true});if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();}
   }else if(dismissOutside&&await menu.isVisible()&&!await locator.evaluate(el=>!!el.closest('.note-graph-menu'))){await page.keyboard.press('Escape');}
  }finally{preparing=false;}
 };
 const actions=new Set(['click','tap','dblclick','fill','press','pressSequentially','selectOption','check','uncheck','focus','dragTo','scrollIntoViewIfNeeded','boundingBox','waitFor']);
 const wrap=locator=>{
  if(proxies.has(locator))return proxies.get(locator);
  const proxy=new Proxy(locator,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args)=>{
   args=args.map(unwrap);
   if(key==='waitFor'&&['hidden','detached'].includes(args[0]?.state))return value.apply(target,args);
   if(actions.has(key))return (async()=>{await prepare(target,!['boundingBox','waitFor','scrollIntoViewIfNeeded'].includes(key));return value.apply(target,args);})();
   const result=key==='getByRole'?roleWithContext(target,args):value.apply(target,args);return result&&typeof result.click==='function'&&typeof result.locator==='function'?wrap(result):result;
  };}});proxies.set(locator,proxy);originals.set(proxy,locator);return proxy;
 };
 page.getByRole=(role,options={})=>wrap(rawRole(role,options).or(rawRole(role,{...options,includeHidden:true}).and(rawLocator('.note-editing-dock,.note-editing-dock *'))));page.locator=(...args)=>wrap(rawLocator(...args));page.getByLabel=(...args)=>wrap(rawLabel(...args));
}
