import { parseOfficialSource } from "../../lib/icai/adapters";
import { detectAttemptKeys } from "../../lib/icai/classify";
import { canonicalOfficialUrl, cleanText, isApprovedIcaiUrl } from "../../lib/icai/html";
import type {
  IcaiLevelCode,
  IcaiResourceType,
  IcaiSourceConfig,
  ParsedIcaiResource,
  ParsedSourcePayload,
} from "../../lib/icai/types";

type SubjectLookup = { id: string; title: string; levelCode: IcaiLevelCode };
type ParsedLanding = { html: string; resources: ParsedIcaiResource[] };
export type IcaiItemFailure = { itemUrl: string; kind: string; message: string };

const MAX_CHILD_PAGES = 80;
const MAX_STUDY_DEPTH = 3;
const MAX_CHILD_BYTES = 2_500_000;
const MAX_RESOLUTION_MS = 60_000;
const MAX_CHILD_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const MAX_RECORDED_ITEM_FAILURES = 25;
const ANCHOR_CONTEXT_BYTES = 1_500;
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

function compactUrlAttemptKey(url: string) {
  const match = /(?:^|[-_/])(jan(?:uary)?|may|sep(?:tember)?|nov(?:ember)?)[-_]?(20\d{2})(?:$|[-_/])/i.exec(url);
  if (!match) return null;
  const month = match[1].toLowerCase();
  const monthNumber = month.startsWith("jan") ? "01" : month === "may" ? "05" : month.startsWith("sep") ? "09" : "11";
  return `${match[2]}-${monthNumber}`;
}

function nestedPageIsInBootstrapWindow(resource: ParsedIcaiResource, source: IcaiSourceConfig) {
  const attemptFloor = configString(source, "bootstrap_attempt_floor", "2026-05");
  const publishedFloor = configString(source, "bootstrap_published_floor", "2025-12-01");
  const attemptKeys = resource.attemptKeys.filter(validAttemptKey);
  const urlAttempt = compactUrlAttemptKey(resource.officialUrl);
  if (urlAttempt && urlAttempt < attemptFloor) return false;
  if (attemptKeys.length && !attemptKeys.some((key) => key >= attemptFloor)) return false;
  if (resource.publishedOn && resource.publishedOn < publishedFloor && !attemptKeys.some((key) => key >= attemptFloor)) {
    return false;
  }
  return true;
}

function applicabilityKeys(value: string) {
  const applicability = [...value.matchAll(/Applicable\s+for\s+(.{1,180}?)(?:Exams?|Examinations?)(?:\s+Onwards)?/gi)];
  return applicability.flatMap((match) => detectAttemptKeys(match[0]));
}

function applicabilityPageIsInBootstrapWindow(html: string, source: IcaiSourceConfig) {
  const attemptFloor = configString(source, "bootstrap_attempt_floor", "2026-05");
  const keys = applicabilityKeys(cleanText(html));
  // Some ICAI selectors contain several applicability branches. The selector is
  // traversable if at least one branch is in scope; each destination page is
  // checked again before any PDF is accepted, so an old May-2025/Jan-2026
  // terminal page cannot leak chapter PDFs into the current bootstrap.
  return keys.length === 0 || keys.some((key) => key >= attemptFloor);
}

function anchorApplicabilityIsInBootstrapWindow(
  html: string,
  baseUrl: string,
  targetUrl: string,
  source: IcaiSourceConfig,
) {
  const attemptFloor = configString(source, "bootstrap_attempt_floor", "2026-05");
  const anchor = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const url = canonicalOfficialUrl(href, baseUrl);
    if (url !== targetUrl) continue;

    const context = cleanText(html.slice(Math.max(0, match.index - ANCHOR_CONTEXT_BYTES), match.index));
    const phrases = [...context.matchAll(/Applicable\s+for\s+(.{1,180}?)(?:Exams?|Examinations?)(?:\s+Onwards)?/gi)];
    const nearest = phrases.at(-1);
    if (!nearest) return true;
    const keys = detectAttemptKeys(nearest[0]);
    return keys.length === 0 || keys.some((key) => key >= attemptFloor);
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
      // ICAI occasionally leaves a stale nested Study Material link in an
      // otherwise valid listing. Treat that one missing leaf as unavailable;
      // the caller will drop it without failing the whole official source.
      if (response.status === 404 || response.status === 410) return null;
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
  skippedUrls: ReadonlySet<string> = new Set(),
  onItem?: (itemUrl: string) => Promise<void>,
) {
  if (source.adapterConfig.direct_study_material_pdfs !== true) {
    return { payload, resolvedLandingPages: 0, droppedLandingPages: 0, unavailableLandingPages: 0, itemFailures: [] as IcaiItemFailure[] };
  }

  const resources: ParsedIcaiResource[] = [];
  const evidencePdfByLanding = new Map<string, string>();
  const visited = new Set<string>();
  let resolvedLandingPages = 0;
  let droppedLandingPages = 0;
  let unavailableLandingPages = 0;
  let childPages = 0;
  const itemFailures: IcaiItemFailure[] = [];
  const recordFailure = (failure: IcaiItemFailure) => {
    if (itemFailures.length < MAX_RECORDED_ITEM_FAILURES) itemFailures.push(failure);
  };
  const resolutionDeadline = Date.now() + MAX_RESOLUTION_MS;

  const parseLanding = async (resource: ParsedIcaiResource): Promise<ParsedLanding | null> => {
    if (visited.has(resource.officialUrl)) return null;
    if (skippedUrls.has(resource.officialUrl)) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "operator_skip", message: "Skipped by an administrator." });
      return null;
    }
    if (Date.now() >= resolutionDeadline) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "source_budget", message: "Nested resolution time budget reached." });
      return null;
    }
    if (childPages >= MAX_CHILD_PAGES) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "page_limit", message: `Nested page limit ${MAX_CHILD_PAGES} reached.` });
      return null;
    }
    visited.add(resource.officialUrl);
    childPages += 1;
    await onItem?.(resource.officialUrl);
    let html: string | null;
    try {
      html = await fetchApprovedHtml(resource.officialUrl, userAgent, Math.min(source.timeoutMs, MAX_CHILD_TIMEOUT_MS));
    } catch (error) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "fetch_error", message: error instanceof Error ? error.message : "Nested ICAI page fetch failed." });
      return null;
    }
    if (html === null) {
      unavailableLandingPages += 1;
      recordFailure({ itemUrl: resource.officialUrl, kind: "not_found", message: "ICAI nested page returned 404 or 410." });
      return null;
    }
    const childSource: IcaiSourceConfig = { ...source, officialUrl: resource.officialUrl };
    const parsed = parseOfficialSource(html, childSource, subjects).resources.map((child) =>
      mergeContext(resource, child),
    );
    return { html, resources: parsed };
  };

  const resolveStudyMaterial = async (
    resource: ParsedIcaiResource,
    depth: number,
  ): Promise<ParsedIcaiResource[]> => {
    if (isDirectPdf(resource.officialUrl)) return [resource];
    if (depth > MAX_STUDY_DEPTH || !isTraversableIcaiPage(resource.officialUrl)) return [];
    if (!nestedPageIsInBootstrapWindow(resource, source)) return [];

    const landing = await parseLanding(resource);
    if (!landing || !applicabilityPageIsInBootstrapWindow(landing.html, source)) return [];

    const direct = landing.resources.filter((child) =>
      isDirectPdf(child.officialUrl) &&
      anchorApplicabilityIsInBootstrapWindow(landing.html, resource.officialUrl, child.officialUrl, source),
    );
    const nested = landing.resources.filter((child) =>
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

    const landing = await parseLanding(resource);
    const pdfs = landing?.resources.filter((child) => isDirectPdf(child.officialUrl)) ?? [];
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
    unavailableLandingPages,
    itemFailures,
  };
}
