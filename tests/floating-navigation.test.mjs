import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(path.join(process.cwd(),'.floating-nav-test-'));
let c;
try {
  const result=await build({stdin:{contents:"export * from './components/shell/floating-navigation';export {allNavigation} from './components/shell/navigation-contract';export {setTestPath} from 'next/navigation';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react'],plugins:[{name:'next-test-adapters',setup(b){
    b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='next/link'?"import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}":"let path='/study-buddy';export const usePathname=()=>path;export const setTestPath=value=>{path=value};export const useRouter=()=>({refresh(){}});"}));
  }}]});
  const file=path.join(dir,'module.mjs');await writeFile(file,result.outputFiles[0].text);c=await import('file://'+file);
} finally {await rm(dir,{recursive:true,force:true});}

test('floating navigation retains every student destination across primary People and More',()=>{
  const routes=[...c.floatingPrimaryNavigation,...c.floatingPeopleNavigation,...c.floatingMoreNavigation.flatMap(section=>section.items)].map(item=>item.href);
  assert.deepEqual([...routes].sort(),c.allNavigation('student').map(item=>item.href).sort());
  assert.equal(routes.length,new Set(routes).size);
  assert.deepEqual(c.floatingPrimaryNavigation.map(item=>item.label),['Home','Today','Study','Progress','Planner']);
});

test('Today does not also mark Planner active and People highlights for buddy pages',()=>{
  c.setTestPath('/planner/today');
  let html=renderToStaticMarkup(React.createElement(c.FloatingNavigation,{}));
  assert.match(html,/href="\/planner\/today"[^>]*aria-current="page"/);
  assert.doesNotMatch(html,/href="\/planner"[^>]*aria-current="page"/);
  c.setTestPath('/study-buddy');
  html=renderToStaticMarkup(React.createElement(c.FloatingNavigation,{}));
  assert.match(html,/<button[^>]*class="is-active"[^>]*aria-label="People"/);
  assert.match(html,/aria-label="More navigation"/);
  assert.match(html,/aria-expanded="false"/);
});
