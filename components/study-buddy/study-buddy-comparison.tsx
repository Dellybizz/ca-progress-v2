import {Icon} from '@/components/ui/icon';
import type {StudyBuddyComparisonItem,StudyBuddyOwnerSummary} from '@/lib/study-buddy/comparison';

export function studyTime(value:number) {
  const minutes=Math.max(0,Math.floor(value));
  return minutes>=60?`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`:`${minutes}m`;
}
function metric(value:number|null|undefined,days=false) {
  return value==null?<span className="buddy-not-shared"><Icon name="lock" size={14}/>Not shared</span>:days?`${value} days`:studyTime(value);
}
export function StudyBuddyComparison({item,owner,name}:{item?:StudyBuddyComparisonItem;owner?:StudyBuddyOwnerSummary;name:string}) {
  return <section className="buddy-surface buddy-comparison" aria-label="Shared progress">
    <h3>Your shared progress</h3>
    <div className="buddy-table-wrap"><table><thead><tr><th scope="col">Metric</th><th scope="col">You</th><th scope="col">{name}</th></tr></thead><tbody>
      <tr><th scope="row">Today</th><td>{owner?studyTime(owner.todayStudyMinutes):'—'}</td><td>{metric(item?.todayStudyMinutes)}</td></tr>
      <tr><th scope="row">Last 7 days</th><td>{owner?studyTime(owner.weekStudyMinutes):'—'}</td><td>{metric(item?.weekStudyMinutes)}</td></tr>
      <tr><th scope="row">Current streak</th><td>{owner?`${owner.currentStreakDays} days`:'—'}</td><td>{metric(item?.currentStreakDays,true)}</td></tr>
      <tr><th scope="row">Weekly target</th><td>{item?.weeklyTargetMinutes==null?'—':studyTime(item.weeklyTargetMinutes)}</td><td>{metric(item?.weeklyTargetMinutes)}</td></tr>
    </tbody></table></div>
    <p className="sr-only">Metrics appear only when the buddy has permitted that relationship field.</p>
  </section>;
}
