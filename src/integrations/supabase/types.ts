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
      ai_generations: {
        Row: {
          coach_id: string
          created_at: string
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          id: string
          prompt: string | null
          response: string
          student_id: string | null
          target_label: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          id?: string
          prompt?: string | null
          response: string
          student_id?: string | null
          target_label: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          generation_type?: Database["public"]["Enums"]["ai_generation_type"]
          id?: string
          prompt?: string | null
          response?: string
          student_id?: string | null
          target_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      coach_of_the_month: {
        Row: {
          coach_id: string
          coach_name: string
          computed_at: string
          id: string
          month: string
          performance_score: number
          total_score: number
          usage_score: number
        }
        Insert: {
          coach_id: string
          coach_name: string
          computed_at?: string
          id?: string
          month: string
          performance_score?: number
          total_score?: number
          usage_score?: number
        }
        Update: {
          coach_id?: string
          coach_name?: string
          computed_at?: string
          id?: string
          month?: string
          performance_score?: number
          total_score?: number
          usage_score?: number
        }
        Relationships: []
      }
      library_documents: {
        Row: {
          created_at: string
          description: string | null
          file_size: number | null
          file_type: string | null
          id: string
          storage_path: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          storage_path: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          storage_path?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      skill_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          unit?: string | null
        }
        Relationships: []
      }
      students: {
        Row: {
          age: number | null
          assigned_coach_id: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          level: Database["public"]["Enums"]["student_level"]
          notes: string | null
          parent_name: string | null
          parent_zalo_phone: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          assigned_coach_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          level?: Database["public"]["Enums"]["student_level"]
          notes?: string | null
          parent_name?: string | null
          parent_zalo_phone?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          assigned_coach_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          level?: Database["public"]["Enums"]["student_level"]
          notes?: string | null
          parent_name?: string | null
          parent_zalo_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      test_scores: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          notes: string | null
          score: number
          skill_category_id: string
          student_id: string
          tested_at: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          score: number
          skill_category_id: string
          student_id: string
          tested_at?: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          score?: number
          skill_category_id?: string
          student_id?: string
          tested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_scores_skill_category_id_fkey"
            columns: ["skill_category_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      compute_coach_of_the_month: {
        Args: never
        Returns: {
          coach_id: string
          coach_name: string
          performance_score: number
          total_score: number
          usage_score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ai_generation_type: "curriculum" | "tryout" | "recommendation"
      app_role: "admin" | "coach"
      student_level: "beginner" | "intermediate" | "advanced"
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
      ai_generation_type: ["curriculum", "tryout", "recommendation"],
      app_role: ["admin", "coach"],
      student_level: ["beginner", "intermediate", "advanced"],
    },
  },
} as const
