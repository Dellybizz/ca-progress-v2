interface CloudflareEnv {
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_APP_ENV: string;
  NEXT_PUBLIC_APP_VERSION: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ICAI_CRON_SECRET?: string;
  ICAI_SYNC_ENABLED?: string;
  ICAI_SYNC_USER_AGENT?: string;
  ICAI_SYNC_SERVICE?: { fetch(request: Request): Promise<Response> };
  USER_RESOURCES_R2?: R2Bucket;
  HEALTH_LOG_DB?: string;
}
