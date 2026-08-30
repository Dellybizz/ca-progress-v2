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
      academic_change_events: {
        Row: { action: string; created_at: string; entity_id: string; entity_type: string; id: number; source_url: string | null; summary: string }
        Insert: { action: string; created_at?: string; entity_id: string; entity_type: string; id?: number; source_url?: string | null; summary: string }
        Update: { action?: string; created_at?: string; entity_id?: string; entity_type?: string; id?: number; source_url?: string | null; summary?: string }
        Relationships: []
      }
      app_settings: {
        Row: { created_at: string; is_public: boolean; key: string; updated_at: string; value: Json }
        Insert: { created_at?: string; is_public?: boolean; key: string; updated_at?: string; value?: Json }
        Update: { created_at?: string; is_public?: boolean; key?: string; updated_at?: string; value?: Json }
        Relationships: []
      }
      attempt_syllabus_map: {
        Row: { attempt_key: string; created_at: string; group_id: string; id: number; level_id: string; subject_id: string; syllabus_version_id: string }
        Insert: { attempt_key: string; created_at?: string; group_id: string; id?: number; level_id: string; subject_id: string; syllabus_version_id: string }
        Update: { attempt_key?: string; created_at?: string; group_id?: string; id?: number; level_id?: string; subject_id?: string; syllabus_version_id?: string }
        Relationships: []
      }
      chapters: {
        Row: { chapter_kind: string; chapter_number: string; created_at: string; id: string; section_key: string | null; slug: string; sort_order: number; source_url: string | null; stable_key: string; syllabus_version_id: string; title: string; updated_at: string }
        Insert: { chapter_kind?: string; chapter_number: string; created_at?: string; id: string; section_key?: string | null; slug: string; sort_order: number; source_url?: string | null; stable_key: string; syllabus_version_id: string; title: string; updated_at?: string }
        Update: { chapter_kind?: string; chapter_number?: string; created_at?: string; id?: string; section_key?: string | null; slug?: string; sort_order?: number; source_url?: string | null; stable_key?: string; syllabus_version_id?: string; title?: string; updated_at?: string }
        Relationships: []
      }
      course_groups: {
        Row: { code: string; created_at: string; id: string; is_active: boolean; is_default: boolean; level_id: string; name: string; sort_order: number; updated_at: string }
        Insert: { code: string; created_at?: string; id: string; is_active?: boolean; is_default?: boolean; level_id: string; name: string; sort_order: number; updated_at?: string }
        Update: { code?: string; created_at?: string; id?: string; is_active?: boolean; is_default?: boolean; level_id?: string; name?: string; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      course_levels: {
        Row: { code: string; created_at: string; id: string; is_active: boolean; name: string; sort_order: number; updated_at: string }
        Insert: { code: string; created_at?: string; id: string; is_active?: boolean; name: string; sort_order: number; updated_at?: string }
        Update: { code?: string; created_at?: string; id?: string; is_active?: boolean; name?: string; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { attempt_key: string | null; avatar_url: string | null; ca_level: string | null; created_at: string; daily_target_minutes: number | null; display_name: string | null; group_choice: string | null; onboarding_completed_at: string | null; onboarding_step: number; updated_at: string; user_id: string }
        Insert: { attempt_key?: string | null; avatar_url?: string | null; ca_level?: string | null; created_at?: string; daily_target_minutes?: number | null; display_name?: string | null; group_choice?: string | null; onboarding_completed_at?: string | null; onboarding_step?: number; updated_at?: string; user_id: string }
        Update: { attempt_key?: string | null; avatar_url?: string | null; ca_level?: string | null; created_at?: string; daily_target_minutes?: number | null; display_name?: string | null; group_choice?: string | null; onboarding_completed_at?: string | null; onboarding_step?: number; updated_at?: string; user_id?: string }
        Relationships: []
      }
      subjects: {
        Row: { code: string; created_at: string; group_id: string; id: string; is_active: boolean; level_id: string; paper_label: string; slug: string; sort_order: number; source_url: string; subject_kind: string; title: string; updated_at: string }
        Insert: { code: string; created_at?: string; group_id: string; id: string; is_active?: boolean; level_id: string; paper_label: string; slug: string; sort_order: number; source_url: string; subject_kind?: string; title: string; updated_at?: string }
        Update: { code?: string; created_at?: string; group_id?: string; id?: string; is_active?: boolean; level_id?: string; paper_label?: string; slug?: string; sort_order?: number; source_url?: string; subject_kind?: string; title?: string; updated_at?: string }
        Relationships: []
      }
      syllabus_versions: {
        Row: { content_hash: string | null; created_at: string; effective_from: string; effective_to: string | null; id: string; source_label: string; source_url: string; source_verified_at: string; status: string; subject_id: string; supersedes_version_id: string | null; title: string; updated_at: string; verification_method: string; version_key: string }
        Insert: { content_hash?: string | null; created_at?: string; effective_from: string; effective_to?: string | null; id: string; source_label?: string; source_url: string; source_verified_at: string; status: string; subject_id: string; supersedes_version_id?: string | null; title: string; updated_at?: string; verification_method?: string; version_key: string }
        Update: { content_hash?: string | null; created_at?: string; effective_from?: string; effective_to?: string | null; id?: string; source_label?: string; source_url?: string; source_verified_at?: string; status?: string; subject_id?: string; supersedes_version_id?: string | null; title?: string; updated_at?: string; verification_method?: string; version_key?: string }
        Relationships: []
      }
      system_health_log: {
        Row: { component: string; correlation_id: string | null; created_at: string; details: Json; id: number; status: string }
        Insert: { component: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status: string }
        Update: { component?: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status?: string }
        Relationships: []
      }
      topics: {
        Row: { chapter_id: string; created_at: string; id: string; sort_order: number; source_url: string | null; stable_key: string; title: string; topic_kind: string; unit_number: string | null; updated_at: string }
        Insert: { chapter_id: string; created_at?: string; id: string; sort_order: number; source_url?: string | null; stable_key: string; title: string; topic_kind?: string; unit_number?: string | null; updated_at?: string }
        Update: { chapter_id?: string; created_at?: string; id?: string; sort_order?: number; source_url?: string | null; stable_key?: string; title?: string; topic_kind?: string; unit_number?: string | null; updated_at?: string }
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
