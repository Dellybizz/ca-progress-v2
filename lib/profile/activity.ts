export type ActivityDay = { date: string; label: string; seconds: number };

export function profileActivity(rows: { ended_at: string; duration_seconds: number }[], timezone: string, now = new Date()): ActivityDay[] {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  const key = (date: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const today = key(now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return { date: date.toISOString().slice(0, 10), label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date), seconds: 0 };
  });
  for (const row of rows) {
    const ended = new Date(row.ended_at.includes('T') ? row.ended_at : row.ended_at.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(ended.getTime()) || ended > now) continue;
    const day = days.find(day => day.date === key(ended));
    if (day) day.seconds += Math.max(0, Number(row.duration_seconds) || 0);
  }
  return days;
}
