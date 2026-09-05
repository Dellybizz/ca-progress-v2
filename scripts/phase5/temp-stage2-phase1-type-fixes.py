from pathlib import Path
import re


def sub(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    p = Path(path)
    text = p.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"pattern count {count} in {path}: {pattern[:100]!r}")
    p.write_text(next_text)


sub(
    "app/api/planner/today/order/route.ts",
    r'  if \(rows\.error \|\| !rows\.data \|\| rows\.data\.length !== itemIds\.length\) \{.*?  const planIds = new Set\(rows\.data\.map\(\(row\) => row\.plan_id\)\);',
    '''  const rowData = (rows.data ?? []) as Array<{ id: string; plan_id: string; user_id: string }>;
  if (rows.error || rowData.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more plan items could not be organised." }, { status: 409 });
  }

  const planId = rowData[0]?.plan_id;
  const planIds = new Set(rowData.map((row) => row.plan_id));''',
    re.S,
)

sub(
    "lib/auth/server.ts",
    r'  if \(attempts\.error \|\| levels\.error \|\| !attempts\.data\?\.length\).*?  for \(const row of attempts\.data\) \{',
    '''  const attemptRows = (attempts.data ?? []) as Array<{ attempt_key: string; label: string; level_id: string }>;
  const levelRows = (levels.data ?? []) as Array<{ id: string; code: CALevel }>;
  if (attempts.error || levels.error || !attemptRows.length) return [{ key: "undecided", label: "Not decided yet", kind: "runtime_fallback" }];
  const levelById = new Map<string, CALevel>(levelRows.map((level) => [level.id, level.code]));
  const grouped = new Map<string, { label: string; levels: Set<CALevel> }>();
  for (const row of attemptRows) {''',
    re.S,
)

sub(
    "lib/community/service.ts",
    r'members: \(memberResult\.data \?\? \[\]\)\.filter\(\(row\) => row\.user_id !== context\.identity\.id\)\.map\(\(row\) => \(\{ userId: row\.user_id, label: row\.label \}\)\),',
    'members: ((memberResult.data ?? []) as Array<{ user_id: string; label: string }>).filter((row) => row.user_id !== context.identity.id).map((row) => ({ userId: row.user_id, label: row.label })),',
)

sub(
    "lib/dashboard/reference.ts",
    r'type ResourceSubjectRow = Database\["public"\]\["Tables"\]\["resource_subject_map"\]\["Row"\];',
    'type ResourceSubjectRow = Database["public"]["Tables"]["resource_subject_map"]["Row"];\ntype EventRow = Database["public"]["Tables"]["exam_events"]["Row"];',
)
sub(
    "lib/dashboard/reference.ts",
    r'const examEvents = \(eventResponse\.data \?\? \[\]\)\.filter\(\(event\) =>',
    'const examEvents = ((eventResponse.data ?? []) as EventRow[]).filter((event) =>',
)

sub(
    "lib/icai/query.ts",
    r'type EventRow = Database\["public"\]\["Tables"\]\["exam_events"\]\["Row"\];',
    'type EventRow = Database["public"]["Tables"]["exam_events"]["Row"];\ntype SyncRunRow = Database["public"]["Tables"]["icai_sync_runs"]["Row"];\ntype ReviewRow = Database["public"]["Tables"]["icai_review_queue"]["Row"];\ntype ChangeRow = Database["public"]["Tables"]["icai_change_events"]["Row"];',
)

p = Path("lib/icai/query.ts")
text = p.read_text()
substitutions = {
    "  const levels = levelsResponse.data ?? [];": "  const levels = (levelsResponse.data ?? []) as LevelRow[];",
    "  const attempts = attemptsResponse.data ?? [];": "  const attempts = (attemptsResponse.data ?? []) as AttemptRow[];",
    "  const resources = resourcesResponse.data ?? [];": "  const resources = (resourcesResponse.data ?? []) as ResourceRow[];",
    "  const sources = sourcesResponse.data ?? [];": "  const sources = (sourcesResponse.data ?? []) as SourceRow[];",
    "  const subjects = subjectsResponse.data ?? [];": "  const subjects = (subjectsResponse.data ?? []) as SubjectRow[];",
    "  const attemptMaps = attemptMapResponse.data ?? [];": "  const attemptMaps = (attemptMapResponse.data ?? []) as AttemptMapRow[];",
    "  const subjectMaps = subjectMapResponse.data ?? [];": "  const subjectMaps = (subjectMapResponse.data ?? []) as SubjectMapRow[];",
    "  const events = eventsResponse.data ?? [];": "  const events = (eventsResponse.data ?? []) as EventRow[];",
    "  const sources = sourceResponse.data ?? [];": "  const sources = (sourceResponse.data ?? []) as SourceRow[];",
    "  const run = runResponse.data;": "  const run = runResponse.data as SyncRunRow | null;",
    "    reviews: (reviewResponse.data ?? []).map((review) => {": "    reviews: ((reviewResponse.data ?? []) as ReviewRow[]).map((review) => {",
    "    recentChanges: (changeResponse.data ?? []).map((change) => ({": "    recentChanges: ((changeResponse.data ?? []) as ChangeRow[]).map((change) => ({",
}
for old, new in substitutions.items():
    if old not in text:
        raise SystemExit(f"missing ICAI pattern: {old}")
    text = text.replace(old, new, 1)
p.write_text(text)

sub(
    "lib/planner/service.ts",
    r'const userEvents = calendar\.events;',
    'const userEvents = calendar.events as unknown as EventRow[];',
)
sub(
    "lib/planner/service.ts",
    r'  const \{ sessions, progress, error \} = await loadActivityRows\(identity\.id\);\n  if \(error\) throw new Error\(`Activity could not be loaded: \$\{error\.message\}`\);',
    '  const { sessions, progress } = await loadActivityRows(identity.id);',
)

sub(
    "lib/resources/service.ts",
    r'type ReportRow = Database\["public"\]\["Tables"\]\["resource_reports"\]\["Row"\];',
    'type ReportRow = Database["public"]["Tables"]["resource_reports"]["Row"];\ntype NamedRow = { id: string; title: string };',
)
sub(
    "lib/resources/service.ts",
    r'subjects: new Map\(\(subjects\.data \?\? \[\]\)\.map\(\(row\) => \[row\.id, row\.title\]\)\),',
    'subjects: new Map(((subjects.data ?? []) as NamedRow[]).map((row) => [row.id, row.title])),',
)
sub(
    "lib/resources/service.ts",
    r'chapters: new Map\(\(chapters\.data \?\? \[\]\)\.map\(\(row\) => \[row\.id, row\.title\]\)\),',
    'chapters: new Map(((chapters.data ?? []) as NamedRow[]).map((row) => [row.id, row.title])),',
)
