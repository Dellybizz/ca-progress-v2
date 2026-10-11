// One shared download for preload, checkout and recovery callers. Never creates a payment.
let pending=null;
export function loadCheckout(){
 if(typeof window==='undefined'||typeof document==='undefined')return Promise.resolve(false);
 if(window.Razorpay)return Promise.resolve(true);
 if(pending)return pending;
 for(const origin of ['https://checkout.razorpay.com','https://api.razorpay.com']){
  if(!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)){
   const link=document.createElement('link');link.rel='preconnect';link.href=origin;document.head.appendChild(link);
  }
 }
 pending=new Promise(resolve=>{
  let script=document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  const fresh=!script;
  if(!script){script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;}
  const target=script;
  const finish=ready=>{clearTimeout(timeout);target.removeEventListener('load',loaded);target.removeEventListener('error',failed);if(!ready)target.remove();resolve(ready);};
  const loaded=()=>finish(Boolean(window.Razorpay)),failed=()=>finish(false);
  const timeout=setTimeout(failed,15000);
  target.addEventListener('load',loaded,{once:true});target.addEventListener('error',failed,{once:true});
  if(fresh)document.head.appendChild(target);
 }).finally(()=>{pending=null;});
 return pending;
}
