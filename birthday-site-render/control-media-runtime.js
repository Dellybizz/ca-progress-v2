(()=>{
  const MEDIA_ENDPOINT='https://aaimjubffhdujevrdamo.supabase.co/functions/v1/birthday-site-media';
  const TRANSIENT=/\.(?:visible|active|open|shown|show|entered|in-view|is-visible|revealed)\b/g;
  let mediaItems=[];
  let selectedSignature='';

  const style=document.createElement('style');
  style.textContent=`
.shared-media-note{margin-bottom:14px;padding:12px 14px;border:1px solid var(--line);background:#111318;border-radius:11px;color:#aeb3bd;font-size:11px}
.media-refresh{margin-left:8px}
.hide-tools{margin:12px 0 14px;padding:12px;border:1px solid var(--line);background:#111318;border-radius:12px}.hide-tools-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hide-tools-status{margin-top:8px;color:var(--muted);font-size:10px;min-height:15px}.hidden-list{display:grid;gap:7px;margin-top:10px}.hidden-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:9px;background:#0f1115}.hidden-item code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aeb3bd;font-size:10px}.hidden-empty{color:#717783;font-size:10px;padding:6px 0}
.media-target-tools{display:none;margin:12px 0 14px;padding:12px;border:1px solid var(--line);background:#111318;border-radius:12px}.media-target-tools.show{display:block}.media-target-tools h4{margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#d5d8de}.media-target-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.media-target-row select{width:100%;border:1px solid var(--line);background:#101217;color:#fff;padding:10px;border-radius:9px}.media-target-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.media-target-actions label{position:relative;overflow:hidden}.media-target-actions input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}.media-target-status{margin-top:8px;color:#aeb3bd;font-size:10px;min-height:15px}.media-target-meta{margin:0 0 10px;color:#858b96;font-size:10px}.media-target-placement{margin-top:8px}.attached-media-list{display:grid;gap:6px;margin-top:10px}.attached-media-item{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px}.attached-media-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9da3ae;font-size:10px}
@media(max-width:600px){.media-target-row,.hidden-item{grid-template-columns:1fr}.media-refresh{margin-left:0}}
`;
  document.head.appendChild(style);

  function adminKey(){return sessionStorage.getItem('birthday-admin-key')||''}
  function pageName(){return document.getElementById('previewPage')?.value||'index.html'}
  function stableSelector(selector){return String(selector||'').replace(TRANSIENT,'')}
  function patchFor(selector){
    const page=pageName();state.patches[page]??=[];
    const stable=stableSelector(selector);
    let patch=state.patches[page].find(p=>stableSelector(p?.selector)===stable);
    if(!patch){patch={selector:stable,styles:{}};state.patches[page].push(patch)}
    else if(patch.selector!==stable)patch.selector=stable;
    return patch;
  }
  function previewElement(){
    if(!selected?.selector)return null;
    const doc=document.getElementById('previewFrame')?.contentDocument;
    if(!doc)return null;
    for(const selector of [selected.selector,stableSelector(selected.selector),stableSelector(selected.selector).replace(/:nth-of-type\(\d+\)/g,'')]){
      try{const el=doc.querySelector(selector);if(el)return el}catch(e){}
    }
    return null;
  }
  function isMediaTarget(){
    if(!selected?.selector)return false;
    if(['img','video','audio','source','picture'].includes(selected.tag))return true;
    const el=previewElement();if(!el)return false;
    const signature=((el.id||'')+' '+(el.className||'')).toLowerCase();
    if(/photo|image|media|visual|polaroid|gallery|poster|picture|pic|frame|shot|avatar|placeholder/.test(signature))return true;
    return !!el.querySelector?.('img,video,audio,source,picture,[class*="photo"],[class*="image"],[class*="media"]');
  }
  function targetIsDirectMedia(){return ['img','video','audio','source'].includes(selected?.tag)}

  async function sharedMedia(){
    const key=adminKey();
    if(!key)throw new Error('Unlock the Control Room first.');
    const r=await fetch(MEDIA_ENDPOINT+'?folder=birthday-site',{headers:{'x-admin-key':key},cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Could not load shared media');
    mediaItems=Array.isArray(j.items)?j.items:[];
    return mediaItems;
  }

  async function uploadShared(file){
    const key=adminKey();
    if(!key)throw new Error('Unlock the Control Room first.');
    const fd=new FormData();fd.append('file',file);fd.append('folder','birthday-site');
    const r=await fetch(MEDIA_ENDPOINT,{method:'POST',headers:{'x-admin-key':key},body:fd});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Upload failed');
    return {name:j.name||file.name,type:j.type||file.type,size:j.size||file.size,url:j.url,path:j.path||''};
  }

  function mediaPreview(rec){
    const u=rec.url||'';const type=String(rec.type||'');
    if(type.startsWith('image/')||!type)return '<img src="'+u+'" alt="">';
    if(type.startsWith('video/'))return '<video src="'+u+'" muted playsinline></video>';
    if(type.startsWith('audio/'))return '<audio controls src="'+u+'"></audio>';
    return '<div style="padding:18px">file</div>';
  }

  async function renderSharedMedia(){
    const box=document.getElementById('mediaGrid');if(!box)return;
    box.innerHTML='<div class="empty">Loading shared media…</div>';
    try{
      const items=await sharedMedia();box.innerHTML='';
      if(!items.length){box.innerHTML='<div class="empty">Upload a photo, video or audio file. Files uploaded here are shared across devices.</div>';return}
      items.forEach(rec=>{
        const c=document.createElement('div');c.className='media-card';
        c.innerHTML='<div class="media-thumb">'+mediaPreview(rec)+'</div><div class="media-meta"><b></b><small></small><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn" data-copy type="button">Copy URL</button></div></div>';
        c.querySelector('b').textContent=rec.name||rec.path||'media';c.querySelector('small').textContent=rec.url||'';
        c.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(rec.url||'');toast?.('URL copied')}catch(e){prompt('Copy media URL',rec.url||'')}};
        box.appendChild(c);
      });
    }catch(e){box.innerHTML='<div class="empty">Could not load media: '+String(e?.message||e).replace(/[<>]/g,'')+'</div>'}
  }

  try{renderMedia=renderSharedMedia}catch(e){window.renderMedia=renderSharedMedia}
  try{listMedia=sharedMedia}catch(e){window.listMedia=sharedMedia}

  const mediaView=document.getElementById('view-media');
  if(mediaView){
    const p=mediaView.querySelector('.pagehead p');if(p)p.innerHTML='Upload photos, video and audio to the <b>shared live media library</b>. Then choose them from media-enabled sections in the Visual Editor.';
    const oldWarn=mediaView.querySelector('.warn');if(oldWarn){oldWarn.className='shared-media-note';oldWarn.textContent='Media is stored in Supabase and synced across devices. Upload once, then select it from any media-enabled section.'}
    const oldInput=document.getElementById('mediaUpload');
    if(oldInput){
      const fresh=oldInput.cloneNode(true);oldInput.replaceWith(fresh);
      fresh.addEventListener('change',async()=>{
        const files=[...(fresh.files||[])];if(!files.length)return;
        try{for(const file of files){toast?.('Uploading '+file.name+'…');await uploadShared(file)}toast?.('Media uploaded');await renderSharedMedia();await refreshMediaPicker()}catch(e){alert(e?.message||String(e))}finally{fresh.value=''}
      });
    }
    const upload=mediaView.querySelector('.pagehead .upload');
    if(upload&&!mediaView.querySelector('#refreshMediaLibrary')){
      const refresh=document.createElement('button');refresh.type='button';refresh.id='refreshMediaLibrary';refresh.className='btn media-refresh';refresh.textContent='Refresh library';upload.after(refresh);
      refresh.onclick=async()=>{refresh.disabled=true;await renderSharedMedia();await refreshMediaPicker();refresh.disabled=false};
    }
  }

  document.querySelectorAll('.add-photo-row,.photo-mini').forEach(el=>el.remove());

  const inspector=document.querySelector('.inspector');
  const fields=document.getElementById('inspectorFields');
  if(inspector&&fields){
    const mediaPanel=document.createElement('div');mediaPanel.id='mediaTargetTools';mediaPanel.className='media-target-tools';
    mediaPanel.innerHTML='<h4>Media</h4><div class="media-target-meta" id="mediaTargetMeta">Choose existing media or upload a new file for this section.</div><div class="media-target-row"><div><label style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#8d929d;margin-bottom:6px">Select media</label><select id="existingMediaSelect"><option value="">Loading library…</option></select></div><button class="btn primary" id="useExistingMedia" type="button">Use selected</button></div><div class="media-target-placement"><label style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#8d929d;margin-bottom:6px">Placement</label><select id="mediaPlacement" style="width:100%;border:1px solid var(--line);background:#101217;color:#fff;padding:10px;border-radius:9px"><option value="replace">Replace media slot</option><option value="inside">Inside selected section</option><option value="after">After selected section</option><option value="before">Before selected section</option></select></div><div class="media-target-actions"><label class="btn primary">+ Add media<input id="addMediaToSelection" type="file" accept="image/*,video/*,audio/*"></label><button class="btn" id="refreshMediaPicker" type="button">Refresh media</button></div><div class="media-target-status" id="mediaTargetStatus"></div><div class="attached-media-list" id="attachedMediaList"></div>';
    fields.before(mediaPanel);

    const hidePanel=document.createElement('div');hidePanel.id='hideTools';hidePanel.className='hide-tools';
    hidePanel.innerHTML='<div class="hide-tools-row"><button type="button" class="btn danger" id="hideSelectedElement">Hide selected</button><button type="button" class="btn" id="refreshHiddenList">Hidden elements</button></div><div class="hide-tools-status" id="hideToolsStatus">Select an element in Edit mode, then hide it from the live page.</div><div class="hidden-list" id="hiddenElementsList"></div>';
    mediaPanel.before(hidePanel);

    const mediaStatus=mediaPanel.querySelector('#mediaTargetStatus');
    const select=mediaPanel.querySelector('#existingMediaSelect');
    const placement=mediaPanel.querySelector('#mediaPlacement');
    const attached=mediaPanel.querySelector('#attachedMediaList');

    window.refreshMediaPicker=async function(){
      try{
        const items=await sharedMedia();const current=select.value;select.innerHTML='<option value="">Select an uploaded file…</option>';
        items.forEach((rec,index)=>{const o=document.createElement('option');o.value=String(index);o.textContent=rec.name||rec.path||('Media '+(index+1));select.appendChild(o)});
        if([...select.options].some(o=>o.value===current))select.value=current;
      }catch(e){select.innerHTML='<option value="">Could not load media</option>';mediaStatus.textContent=e?.message||String(e)}
    };

    function currentPatch(){
      if(!selected?.selector)return null;
      const stable=stableSelector(selected.selector);return (state.patches[pageName()]||[]).find(p=>stableSelector(p?.selector)===stable)||null;
    }
    function renderAttached(){
      attached.innerHTML='';const patch=currentPatch();const list=Array.isArray(patch?.insertImages)?patch.insertImages:[];
      if(!list.length)return;
      list.forEach((item,index)=>{
        const row=document.createElement('div');row.className='attached-media-item';const name=document.createElement('span');name.textContent=item.name||item.url||('Media '+(index+1));
        const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Remove';remove.onclick=async()=>{list.splice(index,1);dirty();mediaStatus.textContent='Removing…';try{await save();mediaStatus.textContent='Removed and published.';reloadPreview();renderAttached()}catch(e){mediaStatus.textContent=e?.message||String(e)}};row.append(name,remove);attached.appendChild(row);
      });
    }

    function updateMediaPanel(){
      const capable=isMediaTarget();mediaPanel.classList.toggle('show',capable);
      hidePanel.style.display=selected?.selector?'block':'none';
      if(capable){
        const el=previewElement();const signature=((el?.id||'')+' '+(el?.className||'')).toLowerCase();
        placement.value=targetIsDirectMedia()?'replace':(/placeholder|photo|image|media|frame|polaroid/.test(signature)?'replace':'inside');
        mediaPanel.querySelector('#mediaTargetMeta').textContent=targetIsDirectMedia()?'This is a media element. Choosing media replaces its source.':'This section supports media. Choose an existing file or upload a new one.';
        renderAttached();
      }else attached.innerHTML='';
    }

    async function applyMedia(rec){
      if(!selected?.selector)throw new Error('Select a media-enabled section first.');
      if(!rec?.url)throw new Error('Choose a media file first.');
      const patch=patchFor(selected.selector);
      if(targetIsDirectMedia()){
        patch.src=rec.url;
      }else{
        patch.insertImages??=[];
        patch.insertImages.push({id:'media-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),url:rec.url,type:rec.type||'',name:rec.name||'',alt:'',placement:placement.value||'replace'});
      }
      dirty();mediaStatus.textContent='Publishing media…';await save();mediaStatus.textContent='Media added and published.';reloadPreview();renderAttached();
    }

    mediaPanel.querySelector('#useExistingMedia').onclick=async()=>{
      const index=Number(select.value);if(!Number.isInteger(index)||!mediaItems[index]){mediaStatus.textContent='Choose a file from Select media first.';return}
      try{await applyMedia(mediaItems[index])}catch(e){mediaStatus.textContent=e?.message||String(e)}
    };
    mediaPanel.querySelector('#addMediaToSelection').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{mediaStatus.textContent='Uploading '+file.name+'…';const rec=await uploadShared(file);mediaItems.unshift(rec);await refreshMediaPicker();select.value='0';await applyMedia(rec);await renderSharedMedia()}catch(err){mediaStatus.textContent=err?.message||String(err)}finally{e.target.value=''}
    };
    mediaPanel.querySelector('#refreshMediaPicker').onclick=()=>refreshMediaPicker();

    const hideStatus=hidePanel.querySelector('#hideToolsStatus'),hiddenList=hidePanel.querySelector('#hiddenElementsList');
    function hiddenPatches(){return (state?.patches?.[pageName()]||[]).filter(p=>p&&p.hidden)}
    function renderHidden(){
      const items=hiddenPatches();hiddenList.innerHTML='';if(!items.length){hiddenList.innerHTML='<div class="hidden-empty">Nothing hidden on this page.</div>';return}
      items.forEach(p=>{const row=document.createElement('div');row.className='hidden-item';const code=document.createElement('code');code.textContent=p.selector||'(unknown selector)';const restore=document.createElement('button');restore.type='button';restore.className='btn';restore.textContent='Restore';restore.onclick=async()=>{p.hidden=false;dirty();hideStatus.textContent='Restoring…';try{await save();hideStatus.textContent='Restored on the live page.';renderHidden();reloadPreview()}catch(e){hideStatus.textContent=e?.message||String(e)}};row.append(code,restore);hiddenList.appendChild(row)})
    }
    hidePanel.querySelector('#hideSelectedElement').onclick=async()=>{if(!selected?.selector){hideStatus.textContent='Select something in the preview first.';return}const patch=patchFor(selected.selector);patch.hidden=true;dirty();hideStatus.textContent='Hiding selected element…';try{await save();hideStatus.textContent='Hidden on the live page.';renderHidden();reloadPreview()}catch(e){hideStatus.textContent=e?.message||String(e)}};
    hidePanel.querySelector('#refreshHiddenList').onclick=renderHidden;

    const originalSelect=typeof selectElement==='function'?selectElement:null;
    if(originalSelect){selectElement=function(el){originalSelect(el);setTimeout(()=>{updateMediaPanel();renderHidden()},0)}}
    document.getElementById('previewPage')?.addEventListener('change',()=>setTimeout(()=>{updateMediaPanel();renderHidden()},0));
    document.getElementById('reloadPreview')?.addEventListener('click',()=>setTimeout(updateMediaPanel,250));
    setInterval(()=>{const sig=(selected?.selector||'')+'|'+(selected?.tag||'');if(sig!==selectedSignature){selectedSignature=sig;updateMediaPanel()}},300);
    renderHidden();refreshMediaPicker();
  }

  renderSharedMedia();
})();
