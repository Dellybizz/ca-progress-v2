// Workers supports manual/follow redirect modes. Never forward payment credentials on redirects.
export async function providerFetch(url:string,init:RequestInit={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{return await fetch(url,{...init,redirect:'manual',signal:controller.signal});}
  finally{clearTimeout(timer);}
}
