import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {scenarioMatrix,releaseTests} from '../../config/payment-rules-scenario-matrix.mjs';
if(scenarioMatrix.length!==47||scenarioMatrix.some((s,i)=>s.id!==i+1)||releaseTests.some(f=>!existsSync(f)))throw Error('Scenario evidence matrix is incomplete.');
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...releaseTests],{encoding:'utf8',maxBuffer:16*1024*1024});
const report={phase:6,checked_at:new Date().toISOString(),status:result.status===0?'passed':'failed',automated_test_count:Number(/# tests (\d+)/.exec(result.stdout)?.[1]??0),scenario_count:47,scenarios:scenarioMatrix.map(s=>({...s,automatedValidation:result.status===0?'passed':'failed'})),live_bank_certification:false,live_email_certification:false};
await mkdir('deployment-evidence/payment-rules-phase6',{recursive:true});await writeFile('deployment-evidence/payment-rules-phase6/scenario-matrix.json',JSON.stringify(report,null,2));
if(result.status!==0){process.stderr.write(result.stderr);process.stderr.write(result.stdout);process.exit(1);}console.log(JSON.stringify({scenarios:47,tests:report.automated_test_count,automated_validation:'passed',bank_proof:'pending'}));
