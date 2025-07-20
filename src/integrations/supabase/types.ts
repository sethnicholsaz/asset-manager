export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_memberships: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cow_dispositions: {
        Row: {
          company_id: string | null
          cow_id: string
          created_at: string
          disposition_date: string
          disposition_type: string
          final_book_value: number
          gain_loss: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          sale_amount: number | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cow_id: string
          created_at?: string
          disposition_date: string
          disposition_type: string
          final_book_value: number
          gain_loss: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          sale_amount?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cow_id?: string
          created_at?: string
          disposition_date?: string
          disposition_type?: string
          final_book_value?: number
          gain_loss?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          sale_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cow_dispositions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cows: {
        Row: {
          acquisition_type: string
          asset_type_id: string
          birth_date: string
          company_id: string | null
          created_at: string
          current_value: number
          depreciation_method: string
          disposition_id: string | null
          freshen_date: string
          id: string
          name: string | null
          purchase_price: number
          salvage_value: number
          status: string
          tag_number: string
          total_depreciation: number
          updated_at: string
        }
        Insert: {
          acquisition_type?: string
          asset_type_id?: string
          birth_date: string
          company_id?: string | null
          created_at?: string
          current_value: number
          depreciation_method?: string
          disposition_id?: string | null
          freshen_date: string
          id: string
          name?: string | null
          purchase_price: number
          salvage_value: number
          status?: string
          tag_number: string
          total_depreciation?: number
          updated_at?: string
        }
        Update: {
          acquisition_type?: string
          asset_type_id?: string
          birth_date?: string
          company_id?: string | null
          created_at?: string
          current_value?: number
          depreciation_method?: string
          disposition_id?: string | null
          freshen_date?: string
          id?: string
          name?: string | null
          purchase_price?: number
          salvage_value?: number
          status?: string
          tag_number?: string
          total_depreciation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cows_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "cow_dispositions"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_settings: {
        Row: {
          auto_calculate_depreciation: boolean
          company_id: string
          created_at: string
          default_depreciation_method: string
          default_depreciation_years: number
          default_salvage_percentage: number
          fiscal_year_start_month: number
          id: string
          include_partial_months: boolean
          monthly_calculation_day: number
          round_to_nearest_dollar: boolean
          updated_at: string
        }
        Insert: {
          auto_calculate_depreciation?: boolean
          company_id: string
          created_at?: string
          default_depreciation_method?: string
          default_depreciation_years?: number
          default_salvage_percentage?: number
          fiscal_year_start_month?: number
          id?: string
          include_partial_months?: boolean
          monthly_calculation_day?: number
          round_to_nearest_dollar?: boolean
          updated_at?: string
        }
        Update: {
          auto_calculate_depreciation?: boolean
          company_id?: string
          created_at?: string
          default_depreciation_method?: string
          default_depreciation_years?: number
          default_salvage_percentage?: number
          fiscal_year_start_month?: number
          id?: string
          include_partial_months?: boolean
          monthly_calculation_day?: number
          round_to_nearest_dollar?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string | null
          created_at: string
          description: string
          entry_date: string
          entry_type: string
          id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description: string
          entry_date: string
          entry_type: string
          id?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          account_name: string
          created_at: string
          credit_amount: number | null
          debit_amount: number | null
          description: string
          id: string
          journal_entry_id: string
          line_type: string
        }
        Insert: {
          account_code: string
          account_name: string
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description: string
          id?: string
          journal_entry_id: string
          line_type: string
        }
        Update: {
          account_code?: string
          account_name?: string
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string
          id?: string
          journal_entry_id?: string
          line_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_price_defaults: {
        Row: {
          birth_year: number
          company_id: string | null
          created_at: string
          daily_accrual_rate: number | null
          default_price: number
          id: string
          updated_at: string
        }
        Insert: {
          birth_year: number
          company_id?: string | null
          created_at?: string
          daily_accrual_rate?: number | null
          default_price: number
          id?: string
          updated_at?: string
        }
        Update: {
          birth_year?: number
          company_id?: string | null
          created_at?: string
          daily_accrual_rate?: number | null
          default_price?: number
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_price_defaults_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fetch_depreciation_settings: {
        Args: { p_company_id: string }
        Returns: {
          id: string
          company_id: string
          default_depreciation_method: string
          default_depreciation_years: number
          default_salvage_percentage: number
          auto_calculate_depreciation: boolean
          monthly_calculation_day: number
          include_partial_months: boolean
          round_to_nearest_dollar: boolean
          fiscal_year_start_month: number
          created_at: string
          updated_at: string
        }[]
      }
      upsert_depreciation_settings: {
        Args: {
          p_company_id: string
          p_default_depreciation_method: string
          p_default_depreciation_years: number
          p_default_salvage_percentage: number
          p_auto_calculate_depreciation: boolean
          p_monthly_calculation_day: number
          p_include_partial_months: boolean
          p_round_to_nearest_dollar: boolean
          p_fiscal_year_start_month: number
        }
        Returns: string
      }
      user_has_company_access: {
        Args: { company_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
