'use client';
import {useSyncExternalStore} from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { resourceDestination, resourceTab, type ResourceTab } from '@/lib/resources/navigation';
const subscribe=(update:()=>void)=>{window.addEventListener('popstate',update);window.addEventListener('ca-files-navigation',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('ca-files-navigation',update);};};
export function ResourceHubTabs({tab,params}:{tab:ResourceTab;params:Record<string,string|string[]|undefined>}) {
  const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>new URLSearchParams(Object.entries(params).filter((entry):entry is [string,string]=>typeof entry[1]==='string')).toString());
  const currentTab=typeof window==='undefined'?tab:resourceTab(new URLSearchParams(search).get('tab')??tab);
  const trash=currentTab==='my'&&new URLSearchParams(search).get('fmView')==='trash';
  const navigate=(event:React.MouseEvent,target:ResourceTab,view='all')=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||(!document.querySelector('[data-resource-collections]')&&(tab!=='my'||target!=='my')))return;event.preventDefault();const query=new URLSearchParams(window.location.search);query.set('tab',target);query.set('fmView',view);query.delete('fmFolder');for(const key of [...query.keys()])if(key.startsWith('fm_'))query.delete(key);window.history.pushState(window.history.state,'',`${window.location.pathname}?${query}`);window.dispatchEvent(new Event('ca-files-navigation'));};
  return <nav className="resource-hub-tabs fm-collections" aria-label="Resource collections">
    {([{key:'my',label:'My resources',icon:'notes'},{key:'shared',label:'Community',icon:'community'},{key:'icai',label:'ICAI official',icon:'shield'}] as const).map(item=><Link aria-label={item.label} data-workspace-drop={item.key==='shared'?'community':item.key==='my'?'root':undefined} prefetch={false} onClick={event=>navigate(event,item.key)} data-collection={item.key} key={item.key} href={resourceDestination(item.key==='my'?{...params,fmView:'all',fmFolder:undefined}:params,item.key)} aria-current={currentTab===item.key&&!(item.key==='my'&&trash)?'page':undefined}><Icon name={item.icon} size={19}/><span className="fm-collection-label-full">{item.label}</span><span className="fm-collection-label-short">{item.key==='my'?'My files':item.key==='icai'?'ICAI':item.label}</span></Link>)}
    <Link className="fm-trash-link" href={resourceDestination({fmView:'trash'},'my')} onClick={event=>navigate(event,'my','trash')} aria-current={trash?'page':undefined}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>Trash</Link>
  </nav>;
}
