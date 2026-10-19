// Prepare a setup during review; consume it only on Continue. Never authorizes a payment.
export function createCheckoutPreparation(){
 let current=null,cleanup=Promise.resolve();
 function discard(){
  const old=current;
  if(!old||old.claimed)return cleanup;
  current=null;
  cleanup=old.promise.then(old.abandon,()=>undefined);
  // Preserve the barrier, including failure, without producing an unhandled rejection.
  void cleanup.catch(()=>{});
  return cleanup;
 }
 function warm(key,prepare,abandon){
  if(current?.key===key)return current.promise;
  if(current)discard();
  const entry={key,claimed:false,abandon,promise:cleanup.catch(()=>undefined).then(prepare)};
  current=entry;
  void entry.promise.catch(()=>{if(current===entry)current=null;});
  return entry.promise;
 }
 function take(key,prepare,abandon){
  const promise=warm(key,prepare,abandon),entry=current;
  entry.claimed=true;
  return promise.finally(()=>{if(current===entry)current=null;});
 }
 return {warm,take,discard};
}
