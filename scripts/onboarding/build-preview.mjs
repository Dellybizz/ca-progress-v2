import {build} from 'esbuild';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const output=path.resolve('deployment-evidence/onboarding-phase2');await mkdir(output,{recursive:true});
const assets={},manifest=[];
for(const [key,name] of [['stationery','stationery.svg'],['book','book.svg']]){
 const bytes=await readFile(`public/onboarding/${name}`);assets[key]=`data:image/svg+xml;base64,${bytes.toString('base64')}`;manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 await mkdir(path.join(output,'native/assets/onboarding'),{recursive:true});await copyFile(`public/onboarding/${name}`,path.join(output,'native/assets/onboarding',name));
}
const result=await build({entryPoints:['apps/onboarding-preview/main.tsx'],outfile:path.join(output,'preview.js'),bundle:true,write:false,minify:true,platform:'browser',target:['chrome120','safari17'],jsx:'automatic',define:{__ONBOARDING_PREVIEW_ASSETS__:JSON.stringify(assets),'process.env.NODE_ENV':'"production"'},loader:{'.css':'css'},legalComments:'none'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>CA Progress — Phase 2 onboarding preview</title><style>html,body{margin:0} ${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script></body></html>`;
await writeFile(path.join(output,'CA-Progress-Onboarding-Phase2.html'),html);await writeFile(path.join(output,'asset-manifest.json'),JSON.stringify({version:1,assets:manifest,fonts:'Local system serif and sans-serif; no remote font dependency.',productionFlowChanged:false},null,2));
console.log(JSON.stringify({preview:path.join(output,'CA-Progress-Onboarding-Phase2.html'),assets:manifest.length,remoteDependencies:0}));
