import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { resourceDestination, type ResourceTab } from '@/lib/resources/navigation';
export function ResourceHubTabs({tab,params}:{tab:ResourceTab;params:Record<string,string|string[]|undefined>}) {
  return <nav className="resource-hub-tabs fm-collections" aria-label="Resource collections">
    {([{key:'my',label:'My resources',icon:'notes'},{key:'shared',label:'Community',icon:'community'},{key:'icai',label:'ICAI official',icon:'shield'}] as const).map(item=><Link data-collection={item.key} key={item.key} href={resourceDestination(params,item.key)} aria-current={tab===item.key?'page':undefined}><Icon name={item.icon} size={19}/>{item.label}</Link>)}
  </nav>;
}
