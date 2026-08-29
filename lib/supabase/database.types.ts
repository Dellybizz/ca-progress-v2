export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      app_settings: {
        Row: { created_at: string; is_public: boolean; key: string; updated_at: string; value: Json }
        Insert: { created_at?: string; is_public?: boolean; key: string; updated_at?: string; value?: Json }
        Update: { created_at?: string; is_public?: boolean; key?: string; updated_at?: string; value?: Json }
        Relationships: []
      }
      auth_otp_rate_limits: {
        Row: { event_type: string; id: number; ip_hash: string; phone_hash: string; requested_at: string }
        Insert: { event_type: string; id?: number; ip_hash: string; phone_hash: string; requested_at?: string }
        Update: { event_type?: string; id?: number; ip_hash?: string; phone_hash?: string; requested_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { attempt_key: string | null; avatar_url: string | null; ca_level: string | null; created_at: string; daily_target_minutes: number | null; display_name: string | null; group_choice: string | null; onboarding_completed_at: string | null; onboarding_step: number; updated_at: string; user_id: string }
        Insert: { attempt_key?: string | null; avatar_url?: string | null; ca_level?: string | null; created_at?: string; daily_target_minutes?: number | null; display_name?: string | null; group_choice?: string | null; onboarding_completed_at?: string | null; onboarding_step?: number; updated_at?: string; user_id: string }
        Update: { attempt_key?: string | null; avatar_url?: string | null; ca_level?: string | null; created_at?: string; daily_target_minutes?: number | null; display_name?: string | null; group_choice?: string | null; onboarding_completed_at?: string | null; onboarding_step?: number; updated_at?: string; user_id?: string }
        Relationships: []
      }
      system_health_log: {
        Row: { component: string; correlation_id: string | null; created_at: string; details: Json; id: number; status: string }
        Insert: { component: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status: string }
        Update: { component?: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status?: string }
        Relationships: []
      }
      user_preferences: {
        Row: { accent: string; created_at: string; density: string; reduce_motion: boolean; theme: string; updated_at: string; user_id: string }
        Insert: { accent?: string; created_at?: string; density?: string; reduce_motion?: boolean; theme?: string; updated_at?: string; user_id: string }
        Update: { accent?: string; created_at?: string; density?: string; reduce_motion?: boolean; theme?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
