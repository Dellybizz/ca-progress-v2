import 'server-only';
import { getD1RuntimeDatabase } from '@/lib/data/d1/client';
import { getDashboardAcademicReference } from '@/lib/dashboard/reference';
import { getProgressDashboardSummary } from '@/lib/progress/service';
import { getStudyBuddyOwnerSummary } from '@/lib/study-buddy/comparison';
import { profileActivity } from './activity';

// Called only with the authenticated owner's ID by the settings page.
export async function getOwnerProfileOverview(userId: string, profile: {ca_level:string|null; group_choice:string|null; attempt_key:string|null; timezone:string|null}) {
  const db = getD1RuntimeDatabase();
  const [academic, summary, sessions, total] = await Promise.all([
    getDashboardAcademicReference(profile.ca_level || '', profile.group_choice || '', profile.attempt_key || ''),
    getStudyBuddyOwnerSummary(userId),
    db.prepare("SELECT ended_at,duration_seconds FROM study_sessions WHERE user_id=?1 AND ended_at>=datetime('now','-8 days')").bind(userId).all<{ended_at:string;duration_seconds:number}>(),
    db.prepare('SELECT COALESCE(SUM(duration_seconds),0) AS seconds FROM study_sessions WHERE user_id=?1').bind(userId).first<{seconds:number}>(),
  ]);
  const progress = academic ? await getProgressDashboardSummary(userId, academic.subjects) : null;
  return {
    completed: progress ? progress.subjects.reduce((sum, subject) => sum + subject.completedCount, 0) : null,
    chapters: academic?.totalChapters ?? null,
    streak: summary.currentStreakDays,
    totalSeconds: Number(total?.seconds ?? 0),
    activity: profileActivity(sessions.results ?? [], profile.timezone || 'Asia/Kolkata'),
  };
}
