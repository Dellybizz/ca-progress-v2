(()=>{
  const raw=location.pathname.split('/').filter(Boolean).pop()||'index.html';
  const adminPreview=new URLSearchParams(location.search).get('adminPreview')==='1';
  let PAGE=raw;
  if(PAGE==='entry.html')PAGE='index.html';
  else if(PAGE==='index.html'&&!adminPreview)PAGE='countdown.html';

  const TRANSIENT=/\.(?:visible|active|open|shown|show|entered|in-view|is-visible|revealed)\b/g;
  const mediaClass='bday-added-media';

  function stableSelector(selector){
    return String(selector||'').replace(TRANSIENT,'');
  }

  function candidateSelectors(selector){
    const original=String(selector||'').trim();
    const stable=stableSelector(original).trim();
    const relaxed=stable.replace(/:nth-of-type\(\d+\)/g,'');
    return [...new Set([original,stable,relaxed].filter(Boolean))];
  }

  function findTarget(selector){
    for(const candidate of candidateSelectors(selector)){
      try{const el=document.querySelector(candidate);if(el)return el}catch(e){}
    }
    return null;
  }

  async function readLive(){
    try{
      if(window.BDAY?.fetchRemote){
        const result=await window.BDAY.fetchRemote();
        if(result?.state)return result.state;
      }
    }catch(e){}
    try{if(window.BDAY?.read)return window.BDAY.read()}catch(e){}
    return window.SITE_CONFIG||{};
  }

  function mimeFromItem(item){
    if(item?.type)return String(item.type).toLowerCase();
    const url=String(item?.url||'').toLowerCase().split('?')[0];
    if(/\.(mp4|webm|mov|m4v)$/.test(url))return 'video/unknown';
    if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(url))return 'audio/unknown';
    return 'image/unknown';
  }

  function mediaNode(item){
    const type=mimeFromItem(item);
    let el;
    if(type.startsWith('video/')){
      el=document.createElement('video');
      el.controls=true;el.playsInline=true;el.preload='metadata';
    }else if(type.startsWith('audio/')){
      el=document.createElement('audio');
      el.controls=true;el.preload='metadata';
    }else{
      el=document.createElement('img');
      el.alt=item?.alt||item?.name||'';el.loading='lazy';el.decoding='async';
    }
    el.src=item.url;
    el.className=mediaClass;
    el.dataset.bdayInserted=item.id||item.url;
    return el;
  }

  function safeDuplicateId(value){
    return String(value||'').replace(/["\\]/g,'');
  }

  function alreadyInserted(item){
    const id=safeDuplicateId(item?.id||item?.url);
    if(!id)return false;
    return !!document.querySelector('[data-bday-inserted="'+id+'"]');
  }

  function groupFor(anchor,placement,key){
    const parent=anchor.parentNode;
    if(!parent)return null;
    const marker='bday-'+placement+'-'+key;
    let group=parent.querySelector?.('[data-bday-group="'+marker.replace(/["\\]/g,'')+'"]');
    if(group)return group;
    group=document.createElement('div');
    group.className='bday-added-media-group';
    group.dataset.bdayGroup=marker;
    if(placement==='before')parent.insertBefore(group,anchor);
    else parent.insertBefore(group,anchor.nextSibling);
    return group;
  }

  function insertOne(anchor,item,patchKey){
    if(!anchor||!item?.url||alreadyInserted(item))return;
    const el=mediaNode(item);
    const placement=item.placement||'inside';
    if(placement==='replace'){
      if(anchor.matches?.('img,video,audio,source')){
        anchor.setAttribute('src',item.url);
        if('src' in anchor)anchor.src=item.url;
        anchor.dataset.bdayInserted=item.id||item.url;
        if(anchor.tagName==='VIDEO'||anchor.tagName==='AUDIO')anchor.load?.();
      }else{
        if(anchor.dataset.bdayMediaReplaced!=='1'){
          anchor.innerHTML='';
          anchor.dataset.bdayMediaReplaced='1';
        }
        anchor.appendChild(el);
      }
    }else if(placement==='before'||placement==='after'){
      const group=groupFor(anchor,placement,patchKey);
      group?.appendChild(el);
    }else{
      anchor.appendChild(el);
    }
  }

  function applyPatch(anchor,patch,patchIndex){
    if(!anchor)return;
    if(patch.hidden)anchor.style.setProperty('display','none','important');
    if(patch.src&&anchor.matches?.('img,video,audio,source')){
      anchor.setAttribute('src',patch.src);
      if('src' in anchor)anchor.src=patch.src;
      if(anchor.tagName==='VIDEO'||anchor.tagName==='AUDIO')anchor.load?.();
    }
    if(patch.href&&anchor.matches?.('a'))anchor.setAttribute('href',patch.href);
    if(patch.styles&&typeof patch.styles==='object'){
      for(const [name,value] of Object.entries(patch.styles)){
        if(value!==undefined&&value!==null&&value!=='')anchor.style.setProperty(name,String(value));
      }
    }
    const inserted=Array.isArray(patch.insertImages)?patch.insertImages:Array.isArray(patch.insertMedia)?patch.insertMedia:[];
    inserted.forEach((item,index)=>insertOne(anchor,item,patchIndex+'-'+index));
  }

  let cachedState=null;
  async function applyAll(forceRead=false){
    if(forceRead||!cachedState)cachedState=await readLive();
    const patches=cachedState?.patches?.[PAGE]||[];
    patches.forEach((patch,index)=>{
      if(!patch?.selector)return;
      const anchor=findTarget(patch.selector);
      if(anchor)applyPatch(anchor,patch,index);
    });
  }

  const style=document.createElement('style');
  style.textContent='.bday-added-media-group{display:grid;gap:14px;margin:16px 0}.bday-added-media{display:block;max-width:min(100%,680px);width:auto;height:auto;margin:0 auto;border-radius:18px;object-fit:cover}.bday-added-media-group>audio,.bday-added-media-group>video{width:min(100%,680px)}';
  document.head.appendChild(style);

  [40,250,800,1800].forEach((delay,index)=>setTimeout(()=>applyAll(index===0),delay));
  const observer=new MutationObserver(()=>applyAll(false));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setTimeout(()=>observer.disconnect(),7000);
})();
