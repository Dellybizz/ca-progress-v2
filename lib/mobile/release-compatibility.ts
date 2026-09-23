export type NativeReleasePlatform = "ios" | "android";

export type NativeReleasePolicy = {
  minimumSupported: number;
  recommended: number;
  storeUrl: string | null;
};

export type NativeReleaseDecision = {
  status: "current" | "recommended" | "required";
  build: number;
  storeUrl: string | null;
};

export function nativeReleaseDecision(build: number, policy: NativeReleasePolicy): NativeReleaseDecision {
  const normalizedBuild = Number.isInteger(build) && build > 0 ? build : 0;
  const minimum = Math.max(1, Math.trunc(policy.minimumSupported));
  const recommended = Math.max(minimum, Math.trunc(policy.recommended));
  const status = normalizedBuild < minimum ? "required" : normalizedBuild < recommended ? "recommended" : "current";
  const storeUrl = typeof policy.storeUrl === "string" && /^https:\/\//.test(policy.storeUrl) ? policy.storeUrl : null;
  return { status, build: normalizedBuild, storeUrl };
}
