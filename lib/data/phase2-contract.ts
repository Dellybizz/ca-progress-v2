import type { DataDomain, PersistenceProvider } from "@/lib/data/migration-contract";
import type { TrustedActor } from "@/lib/data/authorization";
import { requireAdmin, requireModerator, requireOwnership, requireService, requireUser } from "@/lib/data/authorization";

export type LogicalOperation =
  | "publicRead"
  | "ownRead"
  | "ownWrite"
  | "moderate"
  | "adminRead"
  | "adminWrite"
  | "billingWrite"
  | "icaiWrite"
  | "mentorWrite";

export type LogicalAuthorizationInput = {
  actor: TrustedActor;
  persistedOwnerUserId?: string;
};

export interface Phase2LogicalRepositoryContract {
  readonly provider: PersistenceProvider;
  readonly domains: readonly DataDomain[];
  authorize(operation: LogicalOperation, input: LogicalAuthorizationInput): void;
}

function authorizeCommon(operation: LogicalOperation, input: LogicalAuthorizationInput): void {
  switch (operation) {
    case "publicRead": return;
    case "ownRead":
    case "ownWrite":
      requireUser(input.actor);
      if (input.persistedOwnerUserId !== undefined) requireOwnership(input.actor,input.persistedOwnerUserId);
      return;
    case "moderate": requireModerator(input.actor); return;
    case "adminRead":
    case "adminWrite": requireAdmin(input.actor); return;
    case "billingWrite": requireService(input.actor,["billing"]); return;
    case "icaiWrite": requireService(input.actor,["icai-sync"]); return;
    case "mentorWrite": requireService(input.actor,["mentor","system"]); return;
  }
}

const ALL_DOMAINS: readonly DataDomain[] = ["identity","profiles","academic","progress","planner","study","resources","community","billing","icai","mentor"];

/** Logical behavior of the existing Supabase-backed domain adapters at the Phase-1 freeze point. */
export const SUPABASE_PHASE2_CONTRACT: Phase2LogicalRepositoryContract = {
  provider: "supabase",
  domains: ALL_DOMAINS,
  authorize: authorizeCommon,
};

/** Logical behavior required from the target D1 adapter before any cutover. */
export const D1_PHASE2_CONTRACT: Phase2LogicalRepositoryContract = {
  provider: "cloudflare-d1",
  domains: ALL_DOMAINS,
  authorize: authorizeCommon,
};
