// Suggestions never rename an account; the student confirms their username on save.
export function usernameFromName(name: string | null | undefined): string {
  const base = (name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '.')
    .replace(/^[^a-z]+/, '').slice(0, 26).replace(/\.+$/, '');
  return base.length >= 3 ? base : base ? `${base}.ca` : 'student';
}

export const availableUsernameSuggestionSql = `WITH RECURSIVE suffix(n) AS (
  SELECT 0 UNION ALL SELECT n+1 FROM suffix WHERE n<99
), candidates AS (
  SELECT n, CASE WHEN n=0 THEN ?1 ELSE ?1||n END AS username FROM suffix
)
SELECT username FROM candidates c
WHERE NOT EXISTS(SELECT 1 FROM account_usernames a WHERE a.username=c.username COLLATE NOCASE AND a.user_id<>?2)
ORDER BY n LIMIT 1`;
