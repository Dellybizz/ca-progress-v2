type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

type NextRuntime = (
  runtimeEnv: Record<string, unknown>,
) => Promise<Response> | Response;

const forwardedRuntimeKeys = {
  NEXT_PUBLIC_SUPABASE_URL: "x-ca-progress-supabase-url",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "x-ca-progress-supabase-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "x-ca-progress-service-role",
} as const;

/**
 * Split Next server Workers are private Service Binding targets. Until runtime
 * secrets are provisioned independently on every split worker, the ingress
 * Worker forwards the already-existing runtime values over the private binding.
 * They never cross the public Internet.
 */
function runtimeEnvFor(request: Request, env: Record<string, unknown>) {
  return new Proxy(env, {
    get(target, property, receiver) {
      if (typeof property === "string" && property in forwardedRuntimeKeys) {
        const header = forwardedRuntimeKeys[property as keyof typeof forwardedRuntimeKeys];
        const forwarded = request.headers.get(header);
        if (forwarded) return forwarded;
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export async function runNextServer(
  request: Request,
  env: Record<string, unknown>,
  _ctx: WorkerContext,
  run: NextRuntime,
) {
  if (request.headers.get("x-ca-progress-next-internal") !== "ca-progress-v2-router") {
    return new Response("Not found", { status: 404 });
  }
  return run(runtimeEnvFor(request, env));
}
