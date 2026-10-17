// Acknowledge a provider UI event synchronously, then confirm it asynchronously.
// Closing and payment callbacks compete for the same checkout; only one may run.
export function createCheckoutCompletion({closed,confirming,abandon,verify,abandoned,verified,error}){
 let phase='open';
 const settle=(work,done)=>Promise.resolve().then(work).then(result=>{done(result);return true;}).catch(reason=>{error(reason,phase);return false;});
 return {
  dismiss(){if(phase!=='open')return null;phase='closing';closed();return settle(abandon,abandoned);},
  paid(proof){if(phase!=='open')return null;phase='verifying';confirming();return settle(()=>verify(proof),verified);},
 };
}
