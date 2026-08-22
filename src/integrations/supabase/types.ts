export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_deletion_objects: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          log_id: string
          object_name: string
          removed: boolean
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          log_id: string
          object_name: string
          removed?: boolean
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          log_id?: string
          object_name?: string
          removed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_objects_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "account_deletions"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletions: {
        Row: {
          auth_deleted: boolean
          created_at: string
          groups_deleted: number
          groups_transferred: number
          id: string
          last_error_code: string | null
          photos_removed: number
          rides_deleted: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_deleted?: boolean
          created_at?: string
          groups_deleted?: number
          groups_transferred?: number
          id?: string
          last_error_code?: string | null
          photos_removed?: number
          rides_deleted?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_deleted?: boolean
          created_at?: string
          groups_deleted?: number
          groups_transferred?: number
          id?: string
          last_error_code?: string | null
          photos_removed?: number
          rides_deleted?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      camera_reports: {
        Row: {
          address: string
          created_at: string
          description: string
          id: string
          kind: string
          lat: number
          lng: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          lat: number
          lng: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          lat?: number
          lng?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["group_role"]
          status: Database["public"]["Enums"]["group_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: Database["public"]["Enums"]["group_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: Database["public"]["Enums"]["group_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          group_id: string | null
          id: string
          read_at: string | null
          ride_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          ride_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string | null
          id?: string
          read_at?: string | null
          ride_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bike: string | null
          city: string | null
          created_at: string
          id: string
          intercom: boolean
          intercom_type: string
          mesh_supported: boolean
          nick: string
          notify_group_accepted: boolean
          notify_group_invite: boolean
          pref_avoid_ferries: boolean
          pref_avoid_highways: boolean
          pref_avoid_tolls: boolean
          pref_curvy: boolean
          updated_at: string
        }
        Insert: {
          bike?: string | null
          city?: string | null
          created_at?: string
          id: string
          intercom?: boolean
          intercom_type?: string
          mesh_supported?: boolean
          nick: string
          notify_group_accepted?: boolean
          notify_group_invite?: boolean
          pref_avoid_ferries?: boolean
          pref_avoid_highways?: boolean
          pref_avoid_tolls?: boolean
          pref_curvy?: boolean
          updated_at?: string
        }
        Update: {
          bike?: string | null
          city?: string | null
          created_at?: string
          id?: string
          intercom?: boolean
          intercom_type?: string
          mesh_supported?: boolean
          nick?: string
          notify_group_accepted?: boolean
          notify_group_invite?: boolean
          pref_avoid_ferries?: boolean
          pref_avoid_highways?: boolean
          pref_avoid_tolls?: boolean
          pref_curvy?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ride_alert_deliveries: {
        Row: {
          created_at: string
          id: string
          kind: string
          ride_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          ride_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ride_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_alert_deliveries_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_alerts: {
        Row: {
          created_at: string
          enabled: boolean
          hours_before: number
          label: string
          lat: number
          lng: number
          notify_new: boolean
          notify_soon: boolean
          radius_km: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          hours_before?: number
          label?: string
          lat: number
          lng: number
          notify_new?: boolean
          notify_soon?: boolean
          radius_km?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          hours_before?: number
          label?: string
          lat?: number
          lng?: number
          notify_new?: boolean
          notify_soon?: boolean
          radius_km?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ride_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string | null
          ride_id: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          ride_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          ride_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_messages_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_participants: {
        Row: {
          created_at: string
          id: string
          ride_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ride_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ride_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_participants_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_ratings: {
        Row: {
          comment: string
          created_at: string
          id: string
          ride_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string
          created_at?: string
          id?: string
          ride_id: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          ride_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_ratings_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          camera_sources: string[]
          cameras: number | null
          created_at: string
          description: string
          duration_minutes: number | null
          encoded_polyline: string | null
          end_point: string
          group_id: string | null
          host_id: string | null
          host_name: string
          id: string
          intercom: boolean
          intercom_type: string
          mesh_supported: boolean
          km: number
          level: Database["public"]["Enums"]["ride_level"]
          ride_date: string
          ride_time: string
          section_checks: number | null
          spots: number
          start_lat: number | null
          start_lng: number | null
          start_point: string
          title: string
          waypoints: string[]
        }
        Insert: {
          camera_sources?: string[]
          cameras?: number | null
          created_at?: string
          description?: string
          duration_minutes?: number | null
          encoded_polyline?: string | null
          end_point: string
          group_id?: string | null
          host_id?: string | null
          host_name: string
          id?: string
          intercom?: boolean
          intercom_type?: string
          mesh_supported?: boolean
          km?: number
          level?: Database["public"]["Enums"]["ride_level"]
          ride_date: string
          ride_time: string
          section_checks?: number | null
          spots?: number
          start_lat?: number | null
          start_lng?: number | null
          start_point: string
          title: string
          waypoints?: string[]
        }
        Update: {
          camera_sources?: string[]
          cameras?: number | null
          created_at?: string
          description?: string
          duration_minutes?: number | null
          encoded_polyline?: string | null
          end_point?: string
          group_id?: string | null
          host_id?: string | null
          host_name?: string
          id?: string
          intercom?: boolean
          intercom_type?: string
          mesh_supported?: boolean
          km?: number
          level?: Database["public"]["Enums"]["ride_level"]
          ride_date?: string
          ride_time?: string
          section_checks?: number | null
          spots?: number
          start_lat?: number | null
          start_lng?: number | null
          start_point?: string
          title?: string
          waypoints?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rides_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_chat_photo: { Args: { _object_name: string }; Returns: boolean }
      change_group_member_role: {
        Args: {
          p_member_id: string
          p_new_role: Database["public"]["Enums"]["group_role"]
        }
        Returns: undefined
      }
      count_pending_account_deletion_objects: {
        Args: { p_log_id: string }
        Returns: number
      }
      delete_my_account: {
        Args: { p_confirm_delete_orphan_groups?: boolean; p_transfers?: Json }
        Returns: Json
      }
      has_group_link: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      list_incomplete_account_deletions: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          last_error_code: string
          log_id: string
          pending_objects: Json
          status: string
          user_id: string
        }[]
      }
      mark_account_deletion_done: {
        Args: { p_log_id: string; p_photos_removed: number }
        Returns: boolean
      }
      mark_account_deletion_objects_removed: {
        Args: {
          p_bucket_id: string
          p_log_id: string
          p_object_names: string[]
        }
        Returns: number
      }
      set_account_deletion_stage: {
        Args: {
          p_last_error_code?: string
          p_log_id: string
          p_photos_removed?: number
          p_status: string
        }
        Returns: boolean
      }
      wants_notification: {
        Args: { _kind: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      group_member_status: "pending" | "accepted"
      group_role: "owner" | "moderator" | "member"
      ride_level: "chill" | "sport" | "adventure"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      group_member_status: ["pending", "accepted"],
      group_role: ["owner", "moderator", "member"],
      ride_level: ["chill", "sport", "adventure"],
    },
  },
} as const
