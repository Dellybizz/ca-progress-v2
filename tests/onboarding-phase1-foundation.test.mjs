import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('shared controls expose native radio, checkbox, progress and busy semantics',async()=>{
 const {outputFiles}=await build({entryPoints:['components/auth/onboarding/design-system.tsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}});
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const path=await import('node:path');const dir=await mkdtemp(path.join(process.cwd(),'.onboarding-p1-test-'));
 try{const file=path.join(dir,'components.mjs');await writeFile(file,outputFiles[0].text);const c=await import('file://'+file);
 const html=renderToStaticMarkup(React.createElement(c.OnboardingFrame,null,React.createElement(c.OnboardingProgress,{step:99,total:8}),React.createElement(c.OnboardingChoice,{name:'choice',value:'yes',title:'Yes',checked:true,onChange(){}}),React.createElement(c.OnboardingChoice,{name:'multi',value:'notes',title:'Notes',checked:false,multiple:true,onChange(){}}),React.createElement(c.OnboardingButton,{busy:true},'Saving')));
 assert.match(html,/aria-valuenow="8"/);assert.match(html,/type="radio"/);assert.match(html,/type="checkbox"/);assert.match(html,/aria-busy="true"/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/https?:\/\//);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('assets are local standalone SVGs and motion respects accessibility preferences',()=>{
 for(const name of ['book','stationery']){const svg=readFileSync(`public/onboarding/${name}.svg`,'utf8');assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|https?:\/\/(?!www.w3.org)|<foreignObject/);}
 const css=readFileSync('components/auth/onboarding/onboarding.css','utf8');assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/focus-visible/);assert.match(css,/min-width:850px/);
});
