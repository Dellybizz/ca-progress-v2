const routes=new Set(['index.html','memories.html','pretty-photos.html','heart.html','yapping.html','fair.html','countdown.html','finale.html','control.html']);
const raw=location.pathname.split('/').filter(Boolean).pop()||'index.html';
const page=routes.has(raw)?raw:'index.html';
const base='https://aaimjubffhdujevrdamo.supabase.co/storage/v1/object/public/birthday-site-web/';
fetch(base+encodeURIComponent(page),{cache:'no-store'})
  .then(r=>{if(!r.ok)throw new Error('Could not open this page.');return r.text();})
  .then(html=>{document.open();document.write(html);document.close();})
  .catch(err=>{const boot=document.getElementById('boot');if(boot)boot.textContent=err.message;});
