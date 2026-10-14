import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
async function components(){
 const dir=await mkdtemp(path.join(process.cwd(),'.onboarding-p2-test-'));
 const result=await build({entryPoints:['components/auth/onboarding/welcome.tsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}});
 const file=path.join(dir,'welcome.mjs');await writeFile(file,result.outputFiles[0].text);
 return {module:await import('file://'+file),cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('welcome provides an accessible book action with local assets and no fake device chrome',async()=>{
 const {module:c,cleanup}=await components();try{const html=renderToStaticMarkup(React.createElement(c.BookWelcome,{onBegin(){}}));assert.match(html,/aria-label="Begin CA Progress welcome"/);assert.match(html,/Move the book or tap to begin/);assert.match(html,/\/onboarding\/book.svg/);assert.doesNotMatch(html,/https?:\/\/|9:41|battery|signal/);}finally{await cleanup();}
});
test('offline feature entry keeps previews visible but disables all identity actions',async()=>{
 const {module:c,cleanup}=await components();try{
 const props={onGoogle(){},onLinkedIn(){},onLogin(){},onBack(){},online:false};const html=renderToStaticMarkup(React.createElement(c.FeatureSignup,props));
 assert.match(html,/Connect to sign in or create an account/);assert.match(html,/Illustrative feature preview/);assert.match(html,/aria-current="step"/);
 for(const label of ['Continue with Google','Continue with LinkedIn'])assert.match(html,new RegExp('<button[^>]*aria-label="'+label+'"[^>]*disabled=""'));
 assert.match(html,/<button[^>]*disabled=""[^>]*>Already have an account\? Log in<\/button>/);
 const online=renderToStaticMarkup(React.createElement(c.FeatureSignup,{...props,online:true}));
 for(const label of ['Continue with Google','Continue with LinkedIn'])assert.doesNotMatch(online,new RegExp('<button[^>]*aria-label="'+label+'"[^>]*disabled=""'));
 assert.equal(c.onboardingFeatures.length,3);
 }finally{await cleanup();}
});
test('native adapter bundles without a router, server runtime or remote asset requests',async()=>{
 const result=await build({entryPoints:['apps/mobile/src/onboarding-welcome.tsx'],bundle:true,write:false,platform:'browser',format:'esm',target:['chrome120','safari17'],jsx:'automatic',loader:{'.css':'empty'}});
 const source=result.outputFiles[0].text;assert.match(source,/assets\/onboarding\/book.svg/);assert.match(source,/linkedin_oidc/);assert.doesNotMatch(source,/next\/navigation|server-only|fetch\(/);
 const css=await readFile('components/auth/onboarding/welcome.css','utf8');assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset/);
});
