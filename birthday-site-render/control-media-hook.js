(()=>{
  const previousWrite=document.write.bind(document);

  function inject(html){
    if(typeof html!=='string'||!html.includes('Birthday Site Control Room'))return html;
    const addon=`
<style>
.shared-media-note{margin-bottom:14px;padding:12px 14px;border:1px solid var(--line);background:#111318;border-radius:11px;color:#aeb3bd;font-size:11px}
.hide-tools{margin:12px 0 14px;padding:12px;border:1px solid var(--line);background:#111318;border-radius:12px}.hide-tools-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hide-tools-status{margin-top:8px;color:var(--muted);font-size:10px;min-height:15px}.hidden-list{display:grid;gap:7px;margin-top:10px}.hidden-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:9px;background:#0f1115}.hidden-item code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aeb3bd;font-size:10px}.hidden-empty{color:#717783;font-size:10px;padding:6px 0}.media-refresh{margin-left:8px}
@media(max-width:600px){.hidden-item{grid-template-columns:1fr}.media-refresh{margin-left:0}}
</style>
<script>
(()=>{
  const MEDIA_ENDPOINT='https://aaimjubffhdujevrdamo.supabase.co/functions/v1/birthday-site-media';

  async function sharedMedia(){
    const key=sessionStorage.getItem('birthday-admin-key')||'';
    if(!key){try{return uploadedMedia||[]}catch(e){return []}}
    const r=await fetch(MEDIA_ENDPOINT+'?folder=birthday-site',{headers:{'x-admin-key':key},cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Could not load shared media');
    return Array.isArray(j.items)?j.items:[];
  }

  try{listMedia=sharedMedia}catch(e){window.listMedia=sharedMedia}

  const mediaView=document.getElementById('view-media');
  if(mediaView){
    const p=mediaView.querySelector('.pagehead p');
    if(p)p.innerHTML='Upload photos, video and audio to the <b>shared live media library</b>. Files are available from any device where you unlock this Control Room.';
    const oldWarn=mediaView.querySelector('.warn');
    if(oldWarn){oldWarn.className='shared-media-note';oldWarn.textContent='Media is stored in Supabase and synced across devices. Upload once, then use the file URL anywhere in the site.'}
    const upload=mediaView.querySelector('.pagehead .upload');
    if(upload&&!mediaView.querySelector('#refreshMediaLibrary')){
      const refresh=document.createElement('button');refresh.type='button';refresh.id='refreshMediaLibrary';refresh.className='btn media-refresh';refresh.textContent='Refresh library';
      upload.after(refresh);
      refresh.addEventListener('click',async()=>{refresh.disabled=true;try{await renderMedia();if(typeof toast==='function')toast('Media library refreshed')}catch(e){alert(e?.message||String(e))}finally{refresh.disabled=false}});
    }
  }

  const inspector=document.querySelector('.inspector');
  const fields=document.getElementById('inspectorFields');
  if(inspector&&fields&&!document.getElementById('hideTools')){
    const panel=document.createElement('div');panel.id='hideTools';panel.className='hide-tools';
    panel.innerHTML='<div class="hide-tools-row"><button type="button" class="btn danger" id="hideSelectedElement">Hide selected</button><button type="button" class="btn" id="refreshHiddenList">Hidden elements</button></div><div class="hide-tools-status" id="hideToolsStatus">Select an element in Edit mode, then hide it from the live page.</div><div class="hidden-list" id="hiddenElementsList"></div>';
    fields.before(panel);
    const status=panel.querySelector('#hideToolsStatus');
    const list=panel.querySelector('#hiddenElementsList');

    function pageName(){return document.getElementById('previewPage')?.value||'index.html'}
    function hiddenPatches(){return (state?.patches?.[pageName()]||[]).filter(p=>p&&p.hidden)}
    function renderHidden(){
      const items=hiddenPatches();list.innerHTML='';
      if(!items.length){list.innerHTML='<div class="hidden-empty">Nothing hidden on this page.</div>';return}
      items.forEach(p=>{
        const row=document.createElement('div');row.className='hidden-item';
        const code=document.createElement('code');code.textContent=p.selector||'(unknown selector)';
        const restore=document.createElement('button');restore.type='button';restore.className='btn';restore.textContent='Restore';
        restore.addEventListener('click',async()=>{
          p.hidden=false;dirty();status.textContent='Restoring…';
          try{await save();status.textContent='Restored on the live page.';renderHidden();reloadPreview()}catch(e){status.textContent=e?.message||String(e)}
        });
        row.append(code,restore);list.appendChild(row);
      });
    }

    panel.querySelector('#hideSelectedElement').addEventListener('click',async()=>{
      if(!selected?.selector){status.textContent='Select something in the preview first.';return}
      const page=pageName();state.patches[page]??=[];
      let patch=state.patches[page].find(p=>p.selector===selected.selector);
      if(!patch){patch={selector:selected.selector,styles:{}};state.patches[page].push(patch)}
      patch.hidden=true;dirty();status.textContent='Hiding selected element…';
      try{await save();status.textContent='Hidden on the live page. Use Restore below if you change your mind.';renderHidden();reloadPreview()}catch(e){status.textContent=e?.message||String(e)}
    });
    panel.querySelector('#refreshHiddenList').addEventListener('click',renderHidden);
    document.getElementById('previewPage')?.addEventListener('change',()=>setTimeout(renderHidden,0));
    renderHidden();
  }

  const originalRenderMedia=typeof renderMedia==='function'?renderMedia:null;
  if(originalRenderMedia){
    renderMedia=async function(){
      const box=document.getElementById('mediaGrid');
      if(box)box.innerHTML='<div class="empty">Loading shared media…</div>';
      try{return await originalRenderMedia()}catch(e){if(box)box.innerHTML='<div class="empty">Could not load media: '+String(e?.message||e).replace(/[<>]/g,'')+'</div>';throw e}
    };
  }
})();
</script>`;
    const i=html.toLowerCase().lastIndexOf('</body>');
    return i>=0?html.slice(0,i)+addon+html.slice(i):html+addon;
  }

  document.write=function(html){return previousWrite(inject(html))};
})();
