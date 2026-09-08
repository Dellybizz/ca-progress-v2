import { parseOfficialSource } from "../../lib/icai/adapters";
import { isApprovedIcaiUrl } from "../../lib/icai/html";
import type {
  IcaiLevelCode,
  IcaiResourceType,
  IcaiSourceConfig,
  ParsedIcaiResource,
  ParsedSourcePayload,
} from "../../lib/icai/types";

type SubjectLookup = { id: string; title: string; levelCode: IcaiLevelCode };

const MAX_CHILD_PAGES = 80;
const MAX_STUDY_DEPTH = 3;
const MAX_CHILD_BYTES = 2_500_000;
const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const EVIDENCE_TYPES = new Set<IcaiResourceType>(["schedule", "announcement"]);

function isDirectPdf(url: string) {
  try {
    const parsed = new URL(url);
    return isApprovedIcaiUrl(url) && /\.pdf$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function shouldResolve(resource: ParsedIcaiResource) {
  return !isDirectPdf(resource.officialUrl) &&
    (resource.resourceType === "study_material" || EVIDENCE_TYPES.has(resource.resourceType));
}

function configString(source: IcaiSourceConfig, key: string, fallback: string) {
  const value = source.adapterConfig[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validAttemptKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function nestedPageIsInBootstrapWindow(resource: ParsedIcaiResource, source: IcaiSourceConfig) {
  const attemptFloor = configString(source, "bootstrap_attempt_floor", "2026-05");
  const publishedFloor = configString(source, "bootstrap_published_floor", "2025-12-01");
  const attemptKeys = resource.attemptKeys.filter(validAttemptKey);
  if (attemptKeys.length && !attemptKeys.some((key) => key >= attemptFloor)) return false;
  if (resource.publishedOn && resource.publishedOn < publishedFloor && !attemptKeys.some((key) => key >= attemptFloor)) {
    return false;
  }
  return true;
}

function isTraversableIcaiPage(url: string) {
  try {
    const parsed = new URL(url);
    return isApprovedIcaiUrl(url) && parsed.pathname.includes("/post/");
  } catch {
    return false;
  }
}

async function fetchApprovedHtml(url: string, userAgent: string, timeoutMs: number) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isApprovedIcaiUrl(current)) throw new Error("Rejected non-ICAI resource page.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        method: "GET",
        headers: new Headers({
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": userAgent,
        }),
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS) throw new Error("Invalid ICAI resource redirect.");
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new Error(`ICAI resource page returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(`Unexpected ICAI resource content type: ${contentType || "unknown"}`);
      }
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_CHILD_BYTES) {
        throw new Error("ICAI resource page exceeded the HTML safety limit.");
      }
      return html;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("ICAI resource redirect handling failed.");
}

function mergeContext(parent: ParsedIcaiResource, child: ParsedIcaiResource): ParsedIcaiResource {
  return {
    ...child,
    resourceType: parent.resourceType,
    levelCodes: child.levelCodes.length ? child.levelCodes : parent.levelCodes,
    attemptKeys: child.attemptKeys.length ? child.attemptKeys : parent.attemptKeys,
    subjectIds: child.subjectIds.length ? child.subjectIds : parent.subjectIds,
    publishedOn: child.publishedOn ?? parent.publishedOn,
  };
}

function words(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length >= 4),
  );
}

function bestEvidencePdf(parent: ParsedIcaiResource, pdfs: ParsedIcaiResource[]) {
  const parentWords = words(parent.title);
  return [...pdfs].sort((a, b) => {
    const score = (item: ParsedIcaiResource) =>
      [...words(item.title)].filter((word) => parentWords.has(word)).length;
    return score(b) - score(a);
  })[0]?.officialUrl ?? null;
}

export async function resolveDirectStudyMaterialPdfs(
  payload: ParsedSourcePayload,
  source: IcaiSourceConfig,
  subjects: SubjectLookup[],
  userAgent: string,
) {
  if (source.adapterConfig.direct_study_material_pdfs !== true) {
    return { payload, resolvedLandingPages: 0, droppedLandingPages: 0 };
  }

  const resources: ParsedIcaiResource[] = [];
  const evidencePdfByLanding = new Map<string, string>();
  const visited = new Set<string>();
  let resolvedLandingPages = 0;
  let droppedLandingPages = 0;
  let childPages = 0;

  const parseLanding = async (resource: ParsedIcaiResource) => {
    if (visited.has(resource.officialUrl)) return [] as ParsedIcaiResource[];
    if (childPages >= MAX_CHILD_PAGES) {
      throw new Error(`Direct-PDF resolver exceeded ${MAX_CHILD_PAGES} ICAI landing pages.`);
    }
    visited.add(resource.officialUrl);
    childPages += 1;
    const html = await fetchApprovedHtml(resource.officialUrl, userAgent, source.timeoutMs);
    const childSource: IcaiSourceConfig = { ...source, officialUrl: resource.officialUrl };
    return parseOfficialSource(html, childSource, subjects).resources.map((child) =>
      mergeContext(resource, child),
    );
  };

  const resolveStudyMaterial = async (
    resource: ParsedIcaiResource,
    depth: number,
  ): Promise<ParsedIcaiResource[]> => {
    if (isDirectPdf(resource.officialUrl)) return [resource];
    if (depth > MAX_STUDY_DEPTH || !isTraversableIcaiPage(resource.officialUrl)) return [];

    const children = await parseLanding(resource);
    const direct = children.filter((child) => isDirectPdf(child.officialUrl));
    const nested = children.filter((child) =>
      !isDirectPdf(child.officialUrl) &&
      isTraversableIcaiPage(child.officialUrl) &&
      nestedPageIsInBootstrapWindow(child, source),
    );

    const resolved = [...direct];
    if (depth < MAX_STUDY_DEPTH) {
      for (const child of nested) {
        resolved.push(...await resolveStudyMaterial(child, depth + 1));
      }
    }
    if (resolved.length) resolvedLandingPages += 1;
    return resolved;
  };

  for (const resource of payload.resources) {
    if (!shouldResolve(resource)) {
      resources.push(resource);
      continue;
    }

    if (resource.resourceType === "study_material") {
      const pdfs = await resolveStudyMaterial(resource, 0);
      if (pdfs.length) {
        resources.push(...pdfs);
      } else {
        // A Study Material list/subject page is never student-facing. If ICAI's
        // bounded current hierarchy does not end in a PDF, preserve existing D1
        // data and surface the source failure rather than publishing a landing page.
        droppedLandingPages += 1;
      }
      continue;
    }

    const children = await parseLanding(resource);
    const pdfs = children.filter((child) => isDirectPdf(child.officialUrl));
    if (pdfs.length) {
      resources.push(...pdfs);
      resolvedLandingPages += 1;
      const evidence = bestEvidencePdf(resource, pdfs);
      if (evidence) evidencePdfByLanding.set(resource.officialUrl, evidence);
    } else {
      // Some official notices are HTML-only. Keep the notification page when no
      // attached ICAI PDF exists so an administrator can still verify the evidence.
      resources.push(resource);
    }
  }

  const unique = new Map<string, ParsedIcaiResource>();
  for (const resource of resources) unique.set(resource.officialUrl, resource);

  return {
    payload: {
      ...payload,
      resources: [...unique.values()],
      events: payload.events.map((event) => ({
        ...event,
        sourceUrl: evidencePdfByLanding.get(event.sourceUrl) ?? event.sourceUrl,
      })),
    },
    resolvedLandingPages,
    droppedLandingPages,
  };
}
