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
      acquisition_settings: {
        Row: {
          company_id: string
          created_at: string
          default_acquisition_type: string
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_acquisition_type?: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_acquisition_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      balance_adjustments: {
        Row: {
          adjustment_amount: number
          adjustment_date: string
          adjustment_type: string
          applied_to_current_month: boolean
          company_id: string
          cow_tag: string | null
          created_at: string
          description: string
          id: string
          journal_entry_id: string | null
          prior_period_month: number
          prior_period_year: number
          updated_at: string
        }
        Insert: {
          adjustment_amount: number
          adjustment_date?: string
          adjustment_type: string
          applied_to_current_month?: boolean
          company_id: string
          cow_tag?: string | null
          created_at?: string
          description: string
          id?: string
          journal_entry_id?: string | null
          prior_period_month: number
          prior_period_year: number
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          adjustment_date?: string
          adjustment_type?: string
          applied_to_current_month?: boolean
          company_id?: string
          cow_tag?: string | null
          created_at?: string
          description?: string
          id?: string
          journal_entry_id?: string | null
          prior_period_month?: number
          prior_period_year?: number
          updated_at?: string
        }
        Relationships: []
      }
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
          journal_processing_day: number
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
          journal_processing_day?: number
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
          journal_processing_day?: number
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
      gl_account_settings: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          company_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          company_id: string
          created_at: string
          description: string
          entry_date: string
          entry_type: string
          id: string
          month: number
          status: string
          total_amount: number
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          entry_date: string
          entry_type: string
          id?: string
          month: number
          status?: string
          total_amount?: number
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          month?: number
          status?: string
          total_amount?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_code: string
          account_name: string
          cow_id: string | null
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string
          id: string
          journal_entry_id: string
          line_type: string
        }
        Insert: {
          account_code: string
          account_name: string
          cow_id?: string | null
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description: string
          id?: string
          journal_entry_id: string
          line_type: string
        }
        Update: {
          account_code?: string
          account_name?: string
          cow_id?: string | null
          created_at?: string
          credit_amount?: number
          debit_amount?: number
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
      master_file_staging: {
        Row: {
          action_date: string | null
          action_notes: string | null
          action_taken: string | null
          birth_date: string
          company_id: string
          cow_id: string | null
          created_at: string
          current_status: string | null
          discrepancy_type: string
          disposition_date: string | null
          disposition_type: string | null
          freshen_date: string | null
          id: string
          master_file_name: string | null
          sale_amount: number | null
          tag_number: string
          updated_at: string
          verification_date: string
        }
        Insert: {
          action_date?: string | null
          action_notes?: string | null
          action_taken?: string | null
          birth_date: string
          company_id: string
          cow_id?: string | null
          created_at?: string
          current_status?: string | null
          discrepancy_type: string
          disposition_date?: string | null
          disposition_type?: string | null
          freshen_date?: string | null
          id?: string
          master_file_name?: string | null
          sale_amount?: number | null
          tag_number: string
          updated_at?: string
          verification_date?: string
        }
        Update: {
          action_date?: string | null
          action_notes?: string | null
          action_taken?: string | null
          birth_date?: string
          company_id?: string
          cow_id?: string | null
          created_at?: string
          current_status?: string | null
          discrepancy_type?: string
          disposition_date?: string | null
          disposition_type?: string | null
          freshen_date?: string | null
          id?: string
          master_file_name?: string | null
          sale_amount?: number | null
          tag_number?: string
          updated_at?: string
          verification_date?: string
        }
        Relationships: []
      }
      monthly_processing_log: {
        Row: {
          company_id: string
          completed_at: string | null
          cows_processed: number | null
          created_at: string
          entry_type: string
          error_message: string | null
          id: string
          processing_month: number
          processing_year: number
          started_at: string | null
          status: string
          total_amount: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          cows_processed?: number | null
          created_at?: string
          entry_type: string
          error_message?: string | null
          id?: string
          processing_month: number
          processing_year: number
          started_at?: string | null
          status?: string
          total_amount?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          cows_processed?: number | null
          created_at?: string
          entry_type?: string
          error_message?: string | null
          id?: string
          processing_month?: number
          processing_year?: number
          started_at?: string | null
          status?: string
          total_amount?: number | null
        }
        Relationships: []
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
      system_logs: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          level: string
          message: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          level?: string
          message?: string
        }
        Relationships: []
      }
      upload_tokens: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          token_name: string
          token_value: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_name: string
          token_value: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_name?: string
          token_value?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      automated_monthly_processing: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      calculate_cow_monthly_depreciation: {
        Args: {
          p_purchase_price: number
          p_salvage_value: number
          p_freshen_date: string
          p_target_date: string
        }
        Returns: number
      }
      calculate_monthly_depreciation_bulk: {
        Args: {
          company_id: string
          target_month: number
          target_year: number
          cow_data: Json
        }
        Returns: Json
      }
      calculate_partial_month_depreciation: {
        Args: {
          p_purchase_price: number
          p_salvage_value: number
          p_start_date: string
          p_end_date: string
        }
        Returns: number
      }
      catch_up_cow_depreciation_to_date: {
        Args: { p_cow_id: string; p_target_date: string }
        Returns: Json
      }
      cleanup_incomplete_journals: {
        Args: { company_id: string; cutoff_time: string }
        Returns: undefined
      }
      cleanup_post_disposition_depreciation: {
        Args: { p_cow_id: string }
        Returns: Json
      }
      create_acquisition_journals_bulk: {
        Args: { company_id: string; cow_acquisitions: Json }
        Returns: Json
      }
      create_disposition_journals_bulk: {
        Args: { company_id: string; cow_dispositions: Json }
        Returns: Json
      }
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
          journal_processing_day: number
          include_partial_months: boolean
          round_to_nearest_dollar: boolean
          fiscal_year_start_month: number
          created_at: string
          updated_at: string
        }[]
      }
      get_accurate_cow_stats: {
        Args: { p_company_id: string }
        Returns: {
          active_count: number
          total_asset_value: number
          total_current_value: number
          total_depreciation: number
          inactive_count: number
          total_cows: number
        }[]
      }
      get_active_cow_stats: {
        Args: { p_company_id: string }
        Returns: {
          count: number
          total_purchase_price: number
          total_current_value: number
          total_depreciation: number
        }[]
      }
      get_dashboard_stats: {
        Args: { p_company_id: string }
        Returns: Json
      }
      get_historical_processing_status: {
        Args: { p_company_id: string }
        Returns: {
          earliest_cow_year: number
          journal_entries_exist: boolean
          years_with_entries: number[]
          processing_needed: boolean
        }[]
      }
      get_monthly_reconciliation: {
        Args: { p_company_id: string; p_year: number }
        Returns: {
          month_num: number
          year_num: number
          starting_balance: number
          additions: number
          sales: number
          deaths: number
          ending_balance: number
          actual_active_count: number
        }[]
      }
      persist_journal_batch: {
        Args: { journal_entries: Json; journal_lines: Json }
        Returns: Json
      }
      process_acquisition_journal: {
        Args: { p_cow_id: string; p_company_id: string }
        Returns: Json
      }
      process_cow_depreciation_with_disposition_check: {
        Args: { p_cow_id: string; p_disposition_date: string }
        Returns: Json
      }
      process_disposition_journal: {
        Args: { p_disposition_id: string }
        Returns: Json
      }
      process_disposition_journal_corrected: {
        Args: { p_disposition_id: string }
        Returns: Json
      }
      process_disposition_journal_with_catchup: {
        Args: { p_disposition_id: string }
        Returns: Json
      }
      process_disposition_with_partial_depreciation: {
        Args: { p_disposition_id: string }
        Returns: Json
      }
      process_historical_depreciation: {
        Args: {
          p_company_id: string
          p_start_year?: number
          p_end_year?: number
        }
        Returns: Json
      }
      process_historical_depreciation_by_year: {
        Args: { p_company_id: string; p_target_year: number }
        Returns: Json
      }
      process_historical_depreciation_by_year_with_mode: {
        Args: {
          p_company_id: string
          p_target_year: number
          p_processing_mode?: string
        }
        Returns: Json
      }
      process_missing_acquisition_journals: {
        Args: { p_company_id: string }
        Returns: Json
      }
      process_missing_disposition_journals: {
        Args: { p_company_id: string }
        Returns: Json
      }
      process_monthly_depreciation: {
        Args: {
          p_company_id: string
          p_target_month: number
          p_target_year: number
        }
        Returns: Json
      }
      process_monthly_depreciation_with_mode: {
        Args: {
          p_company_id: string
          p_target_month: number
          p_target_year: number
          p_processing_mode?: string
          p_current_month?: number
          p_current_year?: number
        }
        Returns: Json
      }
      reverse_journal_entry: {
        Args: { p_journal_entry_id: string; p_reason?: string }
        Returns: Json
      }
      search_cows: {
        Args: {
          p_company_id: string
          p_search_query: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: string
          tag_number: string
          name: string
          birth_date: string
          freshen_date: string
          purchase_price: number
          current_value: number
          salvage_value: number
          status: string
          acquisition_type: string
          depreciation_method: string
          asset_type_id: string
          total_depreciation: number
          company_id: string
          disposition_id: string
          created_at: string
          updated_at: string
        }[]
      }
      update_cow_depreciation_values: {
        Args: { p_cow_id: string }
        Returns: Json
      }
      upsert_depreciation_settings: {
        Args:
          | {
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
          | {
              p_company_id: string
              p_default_depreciation_method: string
              p_default_depreciation_years: number
              p_default_salvage_percentage: number
              p_auto_calculate_depreciation: boolean
              p_monthly_calculation_day: number
              p_include_partial_months: boolean
              p_round_to_nearest_dollar: boolean
              p_fiscal_year_start_month: number
              p_journal_processing_day?: number
            }
        Returns: string
      }
      user_has_company_access: {
        Args: { company_uuid: string }
        Returns: boolean
      }
      validate_all_cow_depreciation_for_company: {
        Args: { p_company_id: string }
        Returns: Json
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
