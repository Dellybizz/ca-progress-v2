import type { DataDomain, RepositoryContext, RepositoryPort } from "@/lib/data/migration-contract";

export type Phase4ReadMode = "supabase" | "shadow-compare";
export type ShadowComparison = {
  requestKey: string;
  domain: DataDomain;
  actorHash: string | null;
  sourceHash: string;
  targetHash: string;
  equivalent: boolean;
  comparedAt: string;
};

type ComparisonSink = (comparison: ShadowComparison) => Promise<void> | void;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,stable(item)]));
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2,"0")).join("");
}

export function phase4ReadMode(env: NodeJS.ProcessEnv = process.env): Phase4ReadMode {
  return env.CA_PHASE4_SHADOW_READ === "1" ? "shadow-compare" : "supabase";
}

/**
 * Temporary Phase 4 dual-read helper. The Supabase result is always returned to the caller;
 * the D1 result is comparison-only. No dual write or target-serving behavior is introduced.
 */
export async function executePhase4ShadowRead<Q,R>(input: {
  requestKey: string;
  domain: DataDomain;
  context: RepositoryContext;
  query: Q;
  source: RepositoryPort<Q,R>;
  target: RepositoryPort<Q,R>;
  mode?: Phase4ReadMode;
  sink?: ComparisonSink;
}): Promise<R> {
  const sourceResult = await input.source.execute(input.context,input.query);
  if ((input.mode ?? phase4ReadMode()) !== "shadow-compare") return sourceResult;

  let targetResult: R;
  try {
    targetResult = await input.target.execute(input.context,input.query);
  } catch (error) {
    await input.sink?.({
      requestKey: input.requestKey,
      domain: input.domain,
      actorHash: input.context.actor?.userId ? await sha256(input.context.actor.userId) : null,
      sourceHash: await sha256(sourceResult),
      targetHash: `target-error:${error instanceof Error ? error.name : "unknown"}`,
      equivalent: false,
      comparedAt: new Date().toISOString(),
    });
    return sourceResult;
  }

  const [sourceHash,targetHash,actorHash] = await Promise.all([
    sha256(sourceResult), sha256(targetResult), input.context.actor?.userId ? sha256(input.context.actor.userId) : Promise.resolve(null),
  ]);
  await input.sink?.({requestKey:input.requestKey,domain:input.domain,actorHash,sourceHash,targetHash,equivalent:sourceHash===targetHash,comparedAt:new Date().toISOString()});
  return sourceResult;
}

export const PHASE_4_SHADOW_POLICY = Object.freeze({
  productionResultProvider: "supabase" as const,
  targetProvider: "cloudflare-d1" as const,
  comparisonOnly: true as const,
  dualWriteEnabled: false as const,
  removableEnvFlag: "CA_PHASE4_SHADOW_READ" as const,
  mentorPhase3Started: false as const,
});
