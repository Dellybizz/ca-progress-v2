import { parseOfficialSource } from "../../lib/icai/adapters";
import { isApprovedIcaiUrl } from "../../lib/icai/html";
import type {
  IcaiLevelCode,
  IcaiSourceConfig,
  ParsedIcaiResource,
  ParsedSourcePayload,
} from "../../lib/icai/types";

type SubjectLookup = { id: string; title: string; levelCode: IcaiLevelCode };

const MAX_CHILD_PAGES = 50;
const MAX_CHILD_BYTES = 2_500_000;
const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function isDirectPdf(url: string) {
  try {
    const parsed = new URL(url);
    return isApprovedIcaiUrl(url) && /\.pdf$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function fetchApprovedHtml(url: string, userAgent: string, timeoutMs: number) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isApprovedIcaiUrl(current)) throw new Error("Rejected non-ICAI Study Material page.");
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
        if (!location || hop === MAX_REDIRECTS) throw new Error("Invalid ICAI Study Material redirect.");
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new Error(`ICAI Study Material page returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(`Unexpected Study Material content type: ${contentType || "unknown"}`);
      }
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_CHILD_BYTES) {
        throw new Error("ICAI Study Material page exceeded the HTML safety limit.");
      }
      return html;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("ICAI Study Material redirect handling failed.");
}

function mergeContext(parent: ParsedIcaiResource, child: ParsedIcaiResource): ParsedIcaiResource {
  return {
    ...child,
    resourceType: "study_material",
    levelCodes: child.levelCodes.length ? child.levelCodes : parent.levelCodes,
    attemptKeys: child.attemptKeys.length ? child.attemptKeys : parent.attemptKeys,
    subjectIds: child.subjectIds.length ? child.subjectIds : parent.subjectIds,
    publishedOn: child.publishedOn ?? parent.publishedOn,
  };
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
  let resolvedLandingPages = 0;
  let droppedLandingPages = 0;
  let childPages = 0;

  for (const resource of payload.resources) {
    if (resource.resourceType !== "study_material" || isDirectPdf(resource.officialUrl)) {
      resources.push(resource);
      continue;
    }
    if (childPages >= MAX_CHILD_PAGES) {
      throw new Error(`Study Material direct-PDF resolver exceeded ${MAX_CHILD_PAGES} landing pages.`);
    }
    childPages += 1;

    const html = await fetchApprovedHtml(resource.officialUrl, userAgent, source.timeoutMs);
    const childSource: IcaiSourceConfig = { ...source, officialUrl: resource.officialUrl };
    const parsedChild = parseOfficialSource(html, childSource, subjects);
    const pdfs = parsedChild.resources
      .filter((child) => isDirectPdf(child.officialUrl))
      .map((child) => mergeContext(resource, child));

    if (pdfs.length) {
      resources.push(...pdfs);
      resolvedLandingPages += 1;
    } else {
      // Intentionally do not persist the landing page. Student-facing Study
      // Material resources must open the ICAI PDF itself.
      droppedLandingPages += 1;
    }
  }

  const unique = new Map<string, ParsedIcaiResource>();
  for (const resource of resources) unique.set(resource.officialUrl, resource);

  return {
    payload: { ...payload, resources: [...unique.values()] },
    resolvedLandingPages,
    droppedLandingPages,
  };
}
