export type CanonicalAcademicNodeType =
  | "course"
  | "group"
  | "subject"
  | "chapter"
  | "unit"
  | "accounting_standard"
  | "subtopic";

export type CanonicalAcademicIdentity = {
  canonicalId: string;
  nodeType: CanonicalAcademicNodeType;
  officialCode: string | null;
  title: string;
};

export function canonicalCourseId(levelId: string) {
  return `course:${levelId}`;
}

export function canonicalGroupId(groupId: string) {
  return `group:${groupId}`;
}

export function canonicalSubjectId(subjectId: string) {
  return `subject:${subjectId}`;
}

export function canonicalChapterId(subjectId: string, chapterStableKey: string) {
  return `chapter:${subjectId}:${chapterStableKey}`;
}

export function canonicalTopicId(subjectId: string, chapterStableKey: string, topicStableKey: string) {
  return `topic:${subjectId}:${chapterStableKey}:${topicStableKey}`;
}

export function canonicalTopicNodeType(topicKind: string): CanonicalAcademicNodeType {
  if (topicKind === "accounting_standard") return "accounting_standard";
  if (topicKind === "unit") return "unit";
  return "subtopic";
}

export function normalizeAcademicAlias(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

export type LegacyAcademicReference = {
  entityType: "subject" | "chapter" | "topic";
  entityId: string;
  syllabusVersionId?: string | null;
};

export type AcademicLineageRelationship =
  | "renamed_to"
  | "superseded_by"
  | "split_into"
  | "merged_into"
  | "equivalent_to";

/**
 * Canonical IDs deliberately depend on CA Progress-owned immutable IDs/stable keys,
 * never mutable display titles. The SQL Phase 2 backfill uses the exact same formulas.
 */
export function canonicalIdentityForLegacy(input:
  | { entityType: "subject"; subjectId: string; title: string; officialCode?: string | null }
  | {
      entityType: "chapter";
      subjectId: string;
      stableKey: string;
      title: string;
      officialCode?: string | null;
    }
  | {
      entityType: "topic";
      subjectId: string;
      chapterStableKey: string;
      stableKey: string;
      topicKind: string;
      title: string;
      officialCode?: string | null;
    }
): CanonicalAcademicIdentity {
  if (input.entityType === "subject") {
    return {
      canonicalId: canonicalSubjectId(input.subjectId),
      nodeType: "subject",
      officialCode: input.officialCode ?? null,
      title: input.title,
    };
  }

  if (input.entityType === "chapter") {
    return {
      canonicalId: canonicalChapterId(input.subjectId, input.stableKey),
      nodeType: "chapter",
      officialCode: input.officialCode ?? null,
      title: input.title,
    };
  }

  return {
    canonicalId: canonicalTopicId(input.subjectId, input.chapterStableKey, input.stableKey),
    nodeType: canonicalTopicNodeType(input.topicKind),
    officialCode: input.officialCode ?? null,
    title: input.title,
  };
}
