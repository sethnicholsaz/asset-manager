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
      cow_dispositions: {
        Row: {
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
        Relationships: []
      }
      cows: {
        Row: {
          acquisition_type: string
          asset_type_id: string
          birth_date: string
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
            foreignKeyName: "cows_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "cow_dispositions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string
          entry_date: string
          entry_type: string
          id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          entry_date: string
          entry_type: string
          id?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
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
      purchase_price_defaults: {
        Row: {
          birth_year: number
          created_at: string
          daily_accrual_rate: number | null
          default_price: number
          id: string
          updated_at: string
        }
        Insert: {
          birth_year: number
          created_at?: string
          daily_accrual_rate?: number | null
          default_price: number
          id?: string
          updated_at?: string
        }
        Update: {
          birth_year?: number
          created_at?: string
          daily_accrual_rate?: number | null
          default_price?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
