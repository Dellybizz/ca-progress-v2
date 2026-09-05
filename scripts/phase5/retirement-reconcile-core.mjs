function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function keyFor(row, primaryKey) {
  return primaryKey.map((column) => stableStringify(row[column])).join("|");
}

function pick(row, columns) {
  const selected = {};
  for (const column of columns) selected[column] = row[column] ?? null;
  return selected;
}

export function compareSourceSubset(sourceRows, targetRows, primaryKey, comparableColumns) {
  const sourceByKey = new Map(sourceRows.map((row) => [keyFor(row, primaryKey), row]));
  const targetByKey = new Map(targetRows.map((row) => [keyFor(row, primaryKey), row]));
  const missing = [];
  const mismatches = [];
  let verifiedCount = 0;

  for (const [key, source] of sourceByKey) {
    const target = targetByKey.get(key);
    if (!target) {
      missing.push({ key });
      continue;
    }
    const sourceComparable = pick(source, comparableColumns);
    const targetComparable = pick(target, comparableColumns);
    if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
      mismatches.push({ key, source: sourceComparable, target: targetComparable });
      continue;
    }
    verifiedCount += 1;
  }

  let extraTargetRows = 0;
  for (const key of targetByKey.keys()) if (!sourceByKey.has(key)) extraTargetRows += 1;

  return {
    passed: missing.length === 0 && mismatches.length === 0,
    sourceCount: sourceRows.length,
    targetCount: targetRows.length,
    verifiedCount,
    extraTargetRows,
    missing,
    mismatches,
  };
}

export function compareLegacyIdentities(legacyUsers, appUsers, authIdentities) {
  const appById = new Map(appUsers.map((row) => [row.user_id, row]));
  const identityByProviderId = new Map(
    authIdentities
      .filter((row) => row.provider === "supabase_auth")
      .map((row) => [row.provider_user_id, row]),
  );
  const missingAppUsers = [];
  const missingIdentities = [];
  const identityMismatches = [];
  let verifiedCount = 0;

  for (const user of legacyUsers) {
    if (!appById.has(user.id)) missingAppUsers.push(user.id);
    const identity = identityByProviderId.get(user.id);
    if (!identity) {
      missingIdentities.push(user.id);
      continue;
    }
    if (identity.application_user_id !== user.id || identity.identity_id !== `supabase-auth:${user.id}`) {
      identityMismatches.push({
        userId: user.id,
        identityId: identity.identity_id,
        applicationUserId: identity.application_user_id,
      });
      continue;
    }
    if (appById.has(user.id)) verifiedCount += 1;
  }

  const legacyIds = new Set(legacyUsers.map((user) => user.id));
  const extraAppUsers = appUsers.filter((row) => !legacyIds.has(row.user_id)).length;
  const extraSupabaseIdentities = authIdentities.filter(
    (row) => row.provider === "supabase_auth" && !legacyIds.has(row.provider_user_id),
  ).length;

  return {
    passed: missingAppUsers.length === 0 && missingIdentities.length === 0 && identityMismatches.length === 0,
    sourceCount: legacyUsers.length,
    verifiedCount,
    targetAppUserCount: appUsers.length,
    targetSupabaseIdentityCount: authIdentities.filter((row) => row.provider === "supabase_auth").length,
    extraAppUsers,
    extraSupabaseIdentities,
    missingAppUsers,
    missingIdentities,
    identityMismatches,
  };
}
