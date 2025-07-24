-- Fix the catch-up function to work with existing monthly journal entries
-- Instead of creating new journal entries per cow, add lines to existing ones

CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(p_cow_id text, p_target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  cow_record RECORD;
  freshen_date DATE;
  monthly_depreciation NUMERIC;
  current_period DATE;
  end_period DATE;
  period_year INTEGER;
  period_month INTEGER;
  journal_entry_id UUID;
  entries_created INTEGER := 0;
BEGIN
  -- Get cow details
  SELECT * INTO cow_record FROM cows WHERE id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  freshen_date := cow_record.freshen_date;
  monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (5 * 12);
  
  -- Start from the month after freshen date
  current_period := date_trunc('month', freshen_date);
  end_period := date_trunc('month', p_target_date);
  
  WHILE current_period <= end_period LOOP
    period_year := EXTRACT(YEAR FROM current_period);
    period_month := EXTRACT(MONTH FROM current_period);
    
    -- Check if depreciation lines already exist for this cow in this period
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.company_id = cow_record.company_id
        AND je.entry_type = 'depreciation'
        AND je.year = period_year
        AND je.month = period_month
        AND jl.cow_id = p_cow_id
        AND jl.account_code = '1500.1'
    ) THEN
      -- Find or create the monthly depreciation journal entry for this period
      SELECT id INTO journal_entry_id 
      FROM journal_entries 
      WHERE company_id = cow_record.company_id
        AND entry_type = 'depreciation'
        AND year = period_year
        AND month = period_month;
      
      -- If no journal entry exists for this month, create one
      IF journal_entry_id IS NULL THEN
        INSERT INTO journal_entries (
          company_id, entry_date, month, year, entry_type, description, total_amount
        ) VALUES (
          cow_record.company_id,
          (current_period + INTERVAL '1 month - 1 day')::date,
          period_month,
          period_year,
          'depreciation',
          'Monthly Depreciation - ' || period_year || '-' || LPAD(period_month::text, 2, '0'),
          monthly_depreciation
        ) RETURNING id INTO journal_entry_id;
      ELSE
        -- Update the total amount of existing journal entry
        UPDATE journal_entries 
        SET total_amount = total_amount + monthly_depreciation
        WHERE id = journal_entry_id;
      END IF;
      
      -- Create journal lines for this cow
      INSERT INTO journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
      ) VALUES 
      (
        journal_entry_id, '6100', 'Depreciation Expense',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        monthly_depreciation, 0, 'debit', p_cow_id
      ),
      (
        journal_entry_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        0, monthly_depreciation, 'credit', p_cow_id
      );
      
      entries_created := entries_created + 1;
    END IF;
    
    current_period := current_period + INTERVAL '1 month';
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'entries_created', entries_created,
    'target_date', p_target_date
  );
END;
$function$;