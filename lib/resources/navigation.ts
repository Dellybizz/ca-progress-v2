export type ResourceTab = 'my' | 'shared' | 'icai';
export function resourceTab(value: unknown): ResourceTab {
  return value === 'shared' || value === 'icai' ? value : 'my';
}
export function resourceDestination(params: Record<string,string|string[]|undefined>, tab: ResourceTab) {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(params)) {
    if (key === 'tab' || (key === 'communityMessageId' && tab !== 'my') || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key,item);
  }
  if (tab === 'icai' && !query.has('subject') && query.has('subjectId')) query.set('subject',query.get('subjectId')!);
  if (tab !== 'icai' && !query.has('subjectId') && query.has('subject')) query.set('subjectId',query.get('subject')!);
  query.set('tab',tab);
  return `/resources?${query}`;
}
