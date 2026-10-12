/** Bounded, sequential checks; this observer never creates or cancels a payment. */
export function monitorCheckout({read,reconcile,publish,onError,canCheck=()=>true,schedule=setTimeout,cancel=clearTimeout,maxChecks=12,pollIntervalMs=5000,maxIntervalMs=30000}) {
  let stopped=false,checks=0,timer;
  async function tick(){
    if(stopped)return;
    if(!canCheck()){timer=schedule(tick,5000);return;}
    let next;
    try{
      next=await read();
      if(stopped)return;
      if(!canCheck()){timer=schedule(tick,5000);return;}
      publish(next);
      if(next?.resumable&&next.providerStatus==='created')return;
      if(next&&!next.accessGranted&&!['failed','cancelled','succeeded'].includes(next.state)){
        next=await reconcile(next);
        if(stopped)return;
        publish(next);
      }
      if(!next||next.accessGranted||['failed','cancelled','succeeded'].includes(next.state))return;
    }catch(error){if(stopped)return;onError(error);}
    if(++checks<maxChecks&&!stopped)timer=schedule(tick,Math.min(pollIntervalMs*checks,maxIntervalMs));
  }
  void tick();
  return()=>{stopped=true;cancel(timer);};
}
