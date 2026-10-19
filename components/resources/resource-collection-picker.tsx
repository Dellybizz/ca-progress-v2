'use client';
import {useSyncExternalStore} from 'react';
import {UtilitySurface} from './utility-surface';
import {useRouter} from 'next/navigation';
import {resourceDestination,type ResourceTab} from '@/lib/resources/navigation';
const subscribe=(update:()=>void)=>{window.addEventListener('popstate',update);window.addEventListener('ca-files-navigation',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('ca-files-navigation',update);};};
export function ResourceCollectionPicker({tab,params}:{tab:ResourceTab;params:Record<string,string|string[]|undefined>}){
 const router=useRouter();const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>new URLSearchParams(Object.entries(params).filter((item):item is [string,string]=>typeof item[1]==='string')).toString());
 const view=new URLSearchParams(search).get('fmView')??'all';
 const value=tab!=='my'?tab:['recent','starred','trash'].includes(view)?view:'all';
 return <UtilitySurface navigation><label className="fm-mobile-collection"><span className="fm-sr-only">Resource collection</span><select aria-label="Resource collection" value={value} onChange={event=>{const next=event.target.value;if(next==='shared'||next==='icai'){router.push(resourceDestination({},next));return;}if(tab!=='my'){router.push(resourceDestination({fmView:next},'my'));return;}const query=new URLSearchParams(window.location.search);query.set('fmView',next==='all'?'folder':next);query.delete('fmFolder');window.history.pushState(window.history.state,'',`${window.location.pathname}?${query}`);window.dispatchEvent(new Event('ca-files-navigation'));}}><option value="all">My resources</option><option value="recent">Recent</option><option value="starred">Starred</option><option value="trash">Trash</option><option value="shared">Community</option><option value="icai">ICAI official</option></select></label></UtilitySurface>;
}
