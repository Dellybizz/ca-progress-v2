"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useCallback,useState} from 'react';
import {Icon} from '@/components/ui/icon';
import {Popover} from '@/components/ui/popover';
import {AttemptSwitcher} from './attempt-switcher';
import {routeIsActive,shellNavigation,type ShellNavItem} from './navigation-contract';
import type {StudentContextContract} from '@/lib/academic/student-context';
import type {AttemptOption} from '@/lib/profile/validation';

export const floatingPrimaryNavigation=shellNavigation.student[0].items.map(item=>({...item,label:item.href==='/dashboard'?'Home':item.href==='/study'?'Study':item.label,icon:item.href==='/study'?'book':item.href==='/planner/today'?'tests':item.icon} satisfies ShellNavItem));
export const floatingPeopleNavigation=shellNavigation.student.find(section=>section.label==='People')!.items;
export const floatingMoreNavigation=shellNavigation.student.filter(section=>section.label!=='Workspace'&&section.label!=='People');

export function FloatingNavigation({context,attempts=[]}:{context?:StudentContextContract;attempts?:AttemptOption[]}) {
  const pathname=usePathname();
  const [expanded,setExpanded]=useState<{pathname:string;surface:'people'|'more'}|null>(null);
  const open=expanded?.pathname===pathname?expanded.surface:null;
  const close=useCallback(()=>setExpanded(null),[]);
  const peopleActive=floatingPeopleNavigation.some(item=>routeIsActive(item,pathname))||pathname.startsWith('/study-profile/');
  const moreActive=floatingMoreNavigation.some(section=>section.items.some(item=>routeIsActive(item,pathname)));
  const renderLink=(item:ShellNavItem)=><Link key={item.href} href={item.href} prefetch onClick={close} aria-current={routeIsActive(item,pathname)?'page':undefined}><Icon name={item.icon} size={18}/><span>{item.label}</span></Link>;
  return <div className="floating-navigation">
    <nav className="floating-primary" aria-label="Student main navigation" data-route-root-navigation>
      {floatingPrimaryNavigation.map(renderLink)}
      <Popover open={open==='people'} onClose={close} label="People navigation" trigger={({controlsId,expanded})=><button type="button" className={peopleActive?'is-active':''} aria-label="People" aria-controls={controlsId} aria-expanded={expanded} onClick={()=>setExpanded(open==='people'?null:{pathname,surface:'people'})}><Icon name="community" size={19}/><span>People</span></button>}>
        <div className="floating-link-list">{floatingPeopleNavigation.map(renderLink)}</div>
      </Popover>
    </nav>
    <Popover open={open==='more'} onClose={close} label="More navigation" trigger={({controlsId,expanded})=><button type="button" className={`floating-more${moreActive?' is-active':''}`} aria-label="More navigation" aria-controls={controlsId} aria-expanded={expanded} onClick={()=>setExpanded(open==='more'?null:{pathname,surface:'more'})}><Icon name="more" size={21}/></button>}>
      <div className="floating-more-menu">
        {context?<AttemptSwitcher context={context} attempts={attempts}/>:null}
        <div className="floating-menu-groups">{floatingMoreNavigation.map(section=><section key={section.label}><h2>{section.label}</h2><div className="floating-link-list">{section.items.map(renderLink)}</div></section>)}</div>
      </div>
    </Popover>
  </div>;
}
