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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          case_number: string
          client: string
          created_at: string
          id: string
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          case_number: string
          client: string
          created_at?: string
          id?: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          case_number?: string
          client?: string
          created_at?: string
          id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          messages: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_alerts: {
        Row: {
          alert_date: string
          alert_type: string
          checklist_id: string | null
          checklist_item_id: string | null
          created_at: string
          id: string
          is_sent: boolean
          message: string | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          alert_date: string
          alert_type?: string
          checklist_id?: string | null
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          is_sent?: boolean
          message?: string | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          alert_date?: string
          alert_type?: string
          checklist_id?: string | null
          checklist_item_id?: string | null
          created_at?: string
          id?: string
          is_sent?: boolean
          message?: string | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_alerts_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_alerts_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          is_required: boolean
          notes: string | null
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          is_required?: boolean
          notes?: string | null
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          is_required?: boolean
          notes?: string | null
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          days_before_deadline: number | null
          description: string | null
          id: string
          is_required: boolean
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          days_before_deadline?: number | null
          description?: string | null
          id?: string
          is_required?: boolean
          order_index?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          days_before_deadline?: number | null
          description?: string | null
          id?: string
          is_required?: boolean
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          category: string | null
          context: Database["public"]["Enums"]["checklist_context"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          priority: Database["public"]["Enums"]["checklist_priority"]
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          context?: Database["public"]["Enums"]["checklist_context"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          priority?: Database["public"]["Enums"]["checklist_priority"]
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          context?: Database["public"]["Enums"]["checklist_context"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          priority?: Database["public"]["Enums"]["checklist_priority"]
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checklists: {
        Row: {
          case_id: string | null
          client_name: string | null
          completed_at: string | null
          context: Database["public"]["Enums"]["checklist_context"]
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["checklist_priority"]
          status: Database["public"]["Enums"]["checklist_status"]
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          client_name?: string | null
          completed_at?: string | null
          context?: Database["public"]["Enums"]["checklist_context"]
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["checklist_priority"]
          status?: Database["public"]["Enums"]["checklist_status"]
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          client_name?: string | null
          completed_at?: string | null
          context?: Database["public"]["Enums"]["checklist_context"]
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["checklist_priority"]
          status?: Database["public"]["Enums"]["checklist_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          case_id: string | null
          content: string
          created_at: string
          external_deadline: string | null
          external_id: string | null
          external_responsible_name: string | null
          external_responsible_role:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          id: string
          imported_automatically: boolean
          internal_deadline: string | null
          internal_responsible_name: string | null
          internal_responsible_role:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          process_number: string | null
          published_date: string
          raw_payload: Json | null
          source: Database["public"]["Enums"]["publication_source"]
          status: Database["public"]["Enums"]["publication_status"]
          tese: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          content: string
          created_at?: string
          external_deadline?: string | null
          external_id?: string | null
          external_responsible_name?: string | null
          external_responsible_role?:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          id?: string
          imported_automatically?: boolean
          internal_deadline?: string | null
          internal_responsible_name?: string | null
          internal_responsible_role?:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          process_number?: string | null
          published_date: string
          raw_payload?: Json | null
          source?: Database["public"]["Enums"]["publication_source"]
          status?: Database["public"]["Enums"]["publication_status"]
          tese?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          content?: string
          created_at?: string
          external_deadline?: string | null
          external_id?: string | null
          external_responsible_name?: string | null
          external_responsible_role?:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          id?: string
          imported_automatically?: boolean
          internal_deadline?: string | null
          internal_responsible_name?: string | null
          internal_responsible_role?:
            | Database["public"]["Enums"]["publication_responsible_role"]
            | null
          process_number?: string | null
          published_date?: string
          raw_payload?: Json | null
          source?: Database["public"]["Enums"]["publication_source"]
          status?: Database["public"]["Enums"]["publication_status"]
          tese?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_integrations: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          is_active: boolean
          last_poll_error: string | null
          last_poll_status: string | null
          last_received_at: string | null
          monitor_document: string | null
          monitor_oab: string | null
          source: Database["public"]["Enums"]["publication_source"]
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_poll_error?: string | null
          last_poll_status?: string | null
          last_received_at?: string | null
          monitor_document?: string | null
          monitor_oab?: string | null
          source: Database["public"]["Enums"]["publication_source"]
          updated_at?: string
          user_id: string
          webhook_secret?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_poll_error?: string | null
          last_poll_status?: string | null
          last_received_at?: string | null
          monitor_document?: string | null
          monitor_oab?: string | null
          source?: Database["public"]["Enums"]["publication_source"]
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link_tab: string | null
          message: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_tab?: string | null
          message?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_tab?: string | null
          message?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      publication_followups: {
        Row: {
          created_at: string
          id: string
          note: string
          publication_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          publication_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          publication_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_followups_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_integrations: {
        Row: {
          created_at: string
          id: string
          list_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          list_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      document_shares: {
        Row: {
          created_at: string
          document_id: string
          id: string
          permission: string
          shared_by: string
          shared_with: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          permission?: string
          shared_by: string
          shared_with: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          permission?: string
          shared_by?: string
          shared_with?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          created_at: string
          id: string
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      event_attachments: {
        Row: {
          created_at: string
          event_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          invite_sent: boolean
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          invite_sent?: boolean
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          invite_sent?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          case_id: string | null
          created_at: string
          description: string | null
          event_date: string
          event_time: string
          id: string
          location: string | null
          meeting_link: string | null
          notification_enabled: boolean
          notification_minutes_before: number | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          event_time: string
          id?: string
          location?: string | null
          meeting_link?: string | null
          notification_enabled?: boolean
          notification_minutes_before?: number | null
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string
          id?: string
          location?: string | null
          meeting_link?: string | null
          notification_enabled?: boolean
          notification_minutes_before?: number | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          admin_notes: string | null
          budget_range: string | null
          category: string
          created_at: string
          description: string
          estimated_cost: number | null
          expected_deadline: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          budget_range?: string | null
          category: string
          created_at?: string
          description: string
          estimated_cost?: number | null
          expected_deadline?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          budget_range?: string | null
          category?: string
          created_at?: string
          description?: string
          estimated_cost?: number | null
          expected_deadline?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      obligation_history: {
        Row: {
          checklist_id: string | null
          client_name: string | null
          completed_date: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          obligation_type: string
          user_id: string
          was_on_time: boolean | null
        }
        Insert: {
          checklist_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          obligation_type: string
          user_id: string
          was_on_time?: boolean | null
        }
        Update: {
          checklist_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          obligation_type?: string
          user_id?: string
          was_on_time?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "obligation_history_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          oab_number: string | null
          phone: string | null
          specialty: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          oab_number?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          oab_number?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests?: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      cleanup_old_api_usage: { Args: never; Returns: undefined }
      delete_clickup_token: { Args: never; Returns: undefined }
      get_clickup_token: { Args: never; Returns: string }
      get_document_owner_name: { Args: { p_user_id: string }; Returns: string }
      get_profiles_for_admin: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          specialty: string
          updated_at: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_users_for_sharing: {
        Args: { search_term: string }
        Returns: {
          avatar_url: string
          full_name: string
          user_id: string
        }[]
      }
      store_clickup_token: {
        Args: { p_token: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "premium" | "supremo"
      checklist_context: "case" | "client" | "general"
      checklist_priority: "low" | "medium" | "high" | "urgent"
      checklist_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "overdue"
        | "cancelled"
      recurrence_type:
        | "none"
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      publication_responsible_role: "advogado" | "operacional"
      publication_source:
        | "manual"
        | "jusbrasil"
        | "escavador"
        | "outro"
        | "webjur"
      publication_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "overdue"
        | "cancelled"
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
      app_role: ["admin", "user", "premium", "supremo"],
      checklist_context: ["case", "client", "general"],
      checklist_priority: ["low", "medium", "high", "urgent"],
      checklist_status: [
        "pending",
        "in_progress",
        "completed",
        "overdue",
        "cancelled",
      ],
      recurrence_type: [
        "none",
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      publication_responsible_role: ["advogado", "operacional"],
      publication_source: [
        "manual",
        "jusbrasil",
        "escavador",
        "outro",
        "webjur",
      ],
      publication_status: [
        "pending",
        "in_progress",
        "completed",
        "overdue",
        "cancelled",
      ],
    },
  },
} as const
