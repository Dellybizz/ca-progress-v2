export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      app_settings: { Row: { created_at: string; is_public: boolean; key: string; updated_at: string; value: Json }; Insert: { created_at?: string; is_public?: boolean; key: string; updated_at?: string; value?: Json }; Update: { created_at?: string; is_public?: boolean; key?: string; updated_at?: string; value?: Json }; Relationships: [] }
      profiles: { Row: { avatar_url: string | null; created_at: string; display_name: string | null; updated_at: string; user_id: string }; Insert: { avatar_url?: string | null; created_at?: string; display_name?: string | null; updated_at?: string; user_id: string }; Update: { avatar_url?: string | null; created_at?: string; display_name?: string | null; updated_at?: string; user_id?: string }; Relationships: [] }
      system_health_log: { Row: { component: string; correlation_id: string | null; created_at: string; details: Json; id: number; status: string }; Insert: { component: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status: string }; Update: { component?: string; correlation_id?: string | null; created_at?: string; details?: Json; id?: number; status?: string }; Relationships: [] }
      user_preferences: { Row: { accent: string; created_at: string; density: string; reduce_motion: boolean; theme: string; updated_at: string; user_id: string }; Insert: { accent?: string; created_at?: string; density?: string; reduce_motion?: boolean; theme?: string; updated_at?: string; user_id: string }; Update: { accent?: string; created_at?: string; density?: string; reduce_motion?: boolean; theme?: string; updated_at?: string; user_id?: string }; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
