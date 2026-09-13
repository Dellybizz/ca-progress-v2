export const PRODUCT_VISIBILITIES = ["private", "buddy", "public", "moderation"] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

export const DEFAULT_USER_CONTENT_VISIBILITY: ProductVisibility = "private";

export type VisibilityContext = {
  ownerUserId: string;
  viewerUserId: string | null;
  visibility: ProductVisibility;
  isAcceptedBuddy?: boolean;
  isAuthorizedModerator?: boolean;
};

/** Server-side visibility decision shared by future Study Profile, Notes and Articleship surfaces. */
export function canViewUserContent(context: VisibilityContext) {
  if (context.viewerUserId === context.ownerUserId) return true;
  if (context.visibility === "private") return false;
  if (context.visibility === "buddy") return Boolean(context.viewerUserId && context.isAcceptedBuddy);
  if (context.visibility === "moderation") return Boolean(context.isAuthorizedModerator);
  return context.visibility === "public";
}

export function normalizeRequestedVisibility(value: unknown): ProductVisibility {
  return PRODUCT_VISIBILITIES.includes(value as ProductVisibility)
    ? value as ProductVisibility
    : DEFAULT_USER_CONTENT_VISIBILITY;
}
