import Link from 'next/link';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { ShareProfile } from './share-profile';
import type { ActivityDay } from '@/lib/profile/activity';

export type ProfileOverviewProps = {
  userId:string; name:string; avatar:string|null; bio:string; level:string; group:string; attempt:string; dailyMinutes:number; visibility:string; buddyCount:number;
  stats:{completed:number|null;chapters:number|null;streak:number;totalSeconds:number;activity:ActivityDay[]};
};
export function ProfileOverview({userId,name,avatar,bio,level,group,attempt,dailyMinutes,visibility,buddyCount,stats}:ProfileOverviewProps) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  const percent = stats.chapters ? Math.round((stats.completed ?? 0)/stats.chapters*100) : 0;
  const max = Math.max(3600, ...stats.activity.map(day=>day.seconds));
  const hours = (seconds:number) => `${Number((seconds/3600).toFixed(1))}h`;
  const about: {icon:IconName;label:string;value:string}[] = [
    {icon:'book',label:'CA level',value:level},{icon:'layers',label:'Groups',value:group},{icon:'calendar',label:'Target attempt',value:attempt},{icon:'clock',label:'Daily study target',value:`${dailyMinutes} minutes`},
  ];
  const visibilityText = visibility === 'public' ? 'Your profile is visible to everyone.' : visibility === 'buddies' ? 'Your profile is visible to eligible study buddies.' : 'Your profile is visible only to you.';
  return <div className="student-profile">
    <section className="student-profile-identity" aria-label="Your profile">
      <div className="student-profile-identity-main">
        <div className="student-profile-avatar">{avatar ? <Image src={avatar} alt="" width={128} height={128} unoptimized/> : initials}</div>
        <div className="student-profile-intro"><p className="student-profile-eyebrow">My study profile</p><h1>{name}</h1><div className="student-profile-tags"><span>CA {level}</span><span>{group}</span><span>{attempt}</span></div><p>{bio || 'Steady steps. A stronger you.'}</p><Link href="/study-buddy"><strong>{buddyCount}</strong> study {buddyCount === 1 ? 'buddy' : 'buddies'}</Link></div>
        <div className="student-profile-actions"><Link className="student-profile-button student-profile-button--primary" href="/settings/profile?edit=1">Edit profile</Link><ShareProfile userId={userId} visibility={visibility}/><Link className="student-profile-button" href={`/study-profile/${encodeURIComponent(userId)}`}>View profile</Link></div>
      </div>
      <nav className="student-profile-tabs" aria-label="Profile sections"><span aria-current="page">Overview</span><Link href="/progress">Progress</Link><Link href="/analytics">Study stats</Link><Link href="/calendar">Calendar</Link><Link href="/notes">Notes</Link><Link href="/activity">Activity</Link></nav>
    </section>
    <div className="student-profile-columns"><div className="student-profile-primary">
      <section className="student-profile-journey" aria-labelledby="journey-title">
        <div className="student-profile-journey-heading"><div><h2 id="journey-title">Your study journey</h2><p>Steady steps. A stronger you.</p></div><span><Icon name="calendar" size={16}/>{attempt} attempt</span></div>
        <div className="student-profile-coverage"><div className="student-profile-ring" style={{'--coverage':`${percent}%`} as CSSProperties}><Icon name="book" size={36}/></div><div><p className="student-profile-count">{stats.completed ?? '—'} <span>/ {stats.chapters ?? '—'}</span></p><p>chapters completed</p><small>{stats.chapters ? `${percent}% of your syllabus` : 'Syllabus not available for this selection'}</small></div></div>
        <div className="student-profile-metrics">{[{icon:'sparkles' as const,value:`${stats.streak} days`,label:'Current streak'},{icon:'clock' as const,value:hours(stats.totalSeconds),label:'Study time'},{icon:'target' as const,value:`${dailyMinutes}m`,label:'Daily goal'}].map(item=><div key={item.label}><Icon name={item.icon} size={29}/><div><strong>{item.value}</strong><span>{item.label}</span></div></div>)}</div>
      </section>
      <section className="student-profile-card student-profile-activity" aria-labelledby="activity-title"><header><h2 id="activity-title">Study activity</h2><span>Last 7 days</span></header>
        <div className="student-profile-chart" role="img" aria-label={`Study time in your timezone. ${stats.activity.map(day=>`${day.label} ${day.date}: ${hours(day.seconds)}`).join(', ')}`}>
          {stats.activity.map(day=><div className="student-profile-day" key={day.date}><span>{hours(day.seconds)}</span><div className="student-profile-bar-track"><i style={{height:`${day.seconds/max*100}%`}}/></div><small>{day.label}</small></div>)}
        </div>{stats.activity.every(day=>!day.seconds) ? <p className="student-profile-empty">Your completed study sessions will appear here. <Link href="/study">Start studying →</Link></p> : null}
      </section>
    </div><aside className="student-profile-secondary">
      <section className="student-profile-card"><header><h2>About</h2><Link href="/settings/profile?edit=1">Edit</Link></header><dl className="student-profile-about">{about.map(item=><div key={item.label}><dt><Icon name={item.icon}/>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
      <section className="student-profile-card student-profile-visibility"><div className="student-profile-lock"><Icon name="lock"/></div><div><h2>Profile visibility</h2><p>{visibilityText} You control what others see.</p><Link href="/settings/profile?edit=1&privacy=1#privacy">Manage visibility →</Link></div></section>
    </aside></div>
  </div>;
}
