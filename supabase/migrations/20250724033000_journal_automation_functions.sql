-- High-performance journal automation functions
-- Optimized for bulk operations and upload scenarios

-- Function to persist journal batches efficiently
CREATE OR REPLACE FUNCTION persist_journal_batch(
  journal_entries jsonb,
  journal_lines jsonb
) RETURNS jsonb AS $$
DECLARE
  entry_record jsonb;
  line_record jsonb;
  journal_id uuid;
  temp_id_mapping jsonb := '{}';
  created_entries int := 0;
  created_lines int := 0;
BEGIN
  -- Create journal entries
  FOR entry_record IN SELECT * FROM jsonb_array_elements(journal_entries)
  LOOP
    INSERT INTO journal_entries (
      company_id, 
      entry_date, 
      month, 
      year, 
      entry_type, 
      description, 
      total_amount, 
      status
    ) VALUES (
      (entry_record->>'company_id')::uuid,
      (entry_record->>'entry_date')::timestamptz,
      (entry_record->>'month')::int,
      (entry_record->>'year')::int,
      (entry_record->>'entry_type')::text,
      (entry_record->>'description')::text,
      (entry_record->>'total_amount')::decimal,
      (entry_record->>'status')::text
    ) 
    ON CONFLICT (company_id, month, year, entry_type) 
    DO UPDATE SET 
      total_amount = EXCLUDED.total_amount,
      description = EXCLUDED.description,
      entry_date = EXCLUDED.entry_date
    RETURNING id INTO journal_id;
    
    -- Map temporary ID to real journal ID
    temp_id_mapping := temp_id_mapping || jsonb_build_object(
      entry_record->>'description', 
      journal_id
    );
    
    created_entries := created_entries + 1;
  END LOOP;

  -- Create journal lines
  FOR line_record IN SELECT * FROM jsonb_array_elements(journal_lines)
  LOOP
    -- Get the real journal ID from our mapping
    journal_id := (temp_id_mapping->>line_record->>'journal_entry_temp_id')::uuid;
    
    IF journal_id IS NOT NULL THEN
      INSERT INTO journal_lines (
        journal_entry_id,
        cow_id,
        account_code,
        account_name,
        description,
        debit_amount,
        credit_amount,
        line_type
      ) VALUES (
        journal_id,
        CASE 
          WHEN line_record->>'cow_id' != 'null' AND line_record->>'cow_id' != '' 
          THEN (line_record->>'cow_id')::uuid 
          ELSE NULL 
        END,
        line_record->>'account_code',
        line_record->>'account_name',
        line_record->>'description',
        (line_record->>'debit_amount')::decimal,
        (line_record->>'credit_amount')::decimal,
        line_record->>'line_type'
      );
      
      created_lines := created_lines + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'journal_entries_created', created_entries,
    'journal_lines_created', created_lines,
    'success', true
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup incomplete journals
CREATE OR REPLACE FUNCTION cleanup_incomplete_journals(
  company_id uuid,
  cutoff_time timestamptz
) RETURNS void AS $$
BEGIN
  -- Delete journal entries that have no lines and are older than cutoff
  DELETE FROM journal_entries je
  WHERE je.company_id = cleanup_incomplete_journals.company_id
    AND je.created_at < cutoff_time
    AND NOT EXISTS (
      SELECT 1 FROM journal_lines jl 
      WHERE jl.journal_entry_id = je.id
    );
    
  -- Log cleanup action
  INSERT INTO system_logs (level, message, data)
  VALUES (
    'INFO',
    'Cleaned up incomplete journals',
    jsonb_build_object(
      'company_id', company_id,
      'cutoff_time', cutoff_time,
      'deleted_count', ROW_COUNT
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Function for fast acquisition journal creation
CREATE OR REPLACE FUNCTION create_acquisition_journals_bulk(
  company_id uuid,
  cow_acquisitions jsonb
) RETURNS jsonb AS $$
DECLARE
  cow_record jsonb;
  journal_entries jsonb := '[]';
  journal_lines jsonb := '[]';
  entry_description text;
  total_acquisitions decimal := 0;
BEGIN
  -- Build journal entries and lines for all acquisitions
  FOR cow_record IN SELECT * FROM jsonb_array_elements(cow_acquisitions)
  LOOP
    entry_description := 'Acquisition of cow ' || (cow_record->>'tag_number');
    total_acquisitions := total_acquisitions + (cow_record->>'purchase_price')::decimal;
    
    -- Add journal entry
    journal_entries := journal_entries || jsonb_build_array(
      jsonb_build_object(
        'company_id', company_id,
        'entry_date', COALESCE(cow_record->>'created_at', cow_record->>'freshen_date'),
        'month', EXTRACT(MONTH FROM COALESCE(
          (cow_record->>'created_at')::timestamptz, 
          (cow_record->>'freshen_date')::timestamptz
        )),
        'year', EXTRACT(YEAR FROM COALESCE(
          (cow_record->>'created_at')::timestamptz, 
          (cow_record->>'freshen_date')::timestamptz
        )),
        'entry_type', 'acquisition',
        'description', entry_description,
        'total_amount', (cow_record->>'purchase_price')::decimal,
        'status', 'posted'
      )
    );
    
    -- Add journal lines (Debit: Dairy Cows Asset, Credit: Cash/Accounts Payable)
    journal_lines := journal_lines || jsonb_build_array(
      -- Debit: Dairy Cows Asset
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', cow_record->>'id',
        'account_code', '1500',
        'account_name', 'Dairy Cows',
        'description', 'Cow acquisition - ' || (cow_record->>'tag_number'),
        'debit_amount', (cow_record->>'purchase_price')::decimal,
        'credit_amount', 0,
        'line_type', 'asset'
      ),
      -- Credit: Cash (assuming cash purchase for now)
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', cow_record->>'id',
        'account_code', '1000',
        'account_name', 'Cash',
        'description', 'Payment for cow ' || (cow_record->>'tag_number'),
        'debit_amount', 0,
        'credit_amount', (cow_record->>'purchase_price')::decimal,
        'line_type', 'asset'
      )
    );
  END LOOP;
  
  -- Persist the batch
  RETURN persist_journal_batch(journal_entries, journal_lines);
  
END;
$$ LANGUAGE plpgsql;

-- Function for fast disposition journal creation
CREATE OR REPLACE FUNCTION create_disposition_journals_bulk(
  company_id uuid,
  cow_dispositions jsonb
) RETURNS jsonb AS $$
DECLARE
  disposition_record jsonb;
  journal_entries jsonb := '[]';
  journal_lines jsonb := '[]';
  entry_description text;
  cow_data record;
  accumulated_depreciation decimal;
  book_value decimal;
  gain_loss decimal;
BEGIN
  -- Process each disposition
  FOR disposition_record IN SELECT * FROM jsonb_array_elements(cow_dispositions)
  LOOP
    -- Get cow data for calculations
    SELECT 
      c.tag_number,
      c.purchase_price,
      c.salvage_value,
      c.freshen_date,
      EXTRACT(MONTHS FROM AGE(
        (disposition_record->>'disposition_date')::date,
        c.freshen_date
      )) as months_owned
    INTO cow_data
    FROM cows c
    WHERE c.id = (disposition_record->>'cow_id')::uuid;
    
    -- Calculate accumulated depreciation (simple straight-line for 5 years)
    accumulated_depreciation := LEAST(
      (cow_data.purchase_price - cow_data.salvage_value) * cow_data.months_owned / 60.0,
      cow_data.purchase_price - cow_data.salvage_value
    );
    
    book_value := cow_data.purchase_price - accumulated_depreciation;
    gain_loss := COALESCE((disposition_record->>'sale_price')::decimal, 0) - book_value;
    
    entry_description := 'Disposition of cow ' || cow_data.tag_number;
    
    -- Add journal entry
    journal_entries := journal_entries || jsonb_build_array(
      jsonb_build_object(
        'company_id', company_id,
        'entry_date', disposition_record->>'disposition_date',
        'month', EXTRACT(MONTH FROM (disposition_record->>'disposition_date')::date),
        'year', EXTRACT(YEAR FROM (disposition_record->>'disposition_date')::date),
        'entry_type', 'disposition',
        'description', entry_description,
        'total_amount', ABS(gain_loss),
        'status', 'posted'
      )
    );
    
    -- Add journal lines for disposition
    journal_lines := journal_lines || jsonb_build_array(
      -- Debit: Accumulated Depreciation
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', disposition_record->>'cow_id',
        'account_code', '1500.1',
        'account_name', 'Accumulated Depreciation - Dairy Cows',
        'description', 'Write off accumulated depreciation',
        'debit_amount', accumulated_depreciation,
        'credit_amount', 0,
        'line_type', 'contra_asset'
      ),
      -- Credit: Dairy Cows Asset
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', disposition_record->>'cow_id',
        'account_code', '1500',
        'account_name', 'Dairy Cows',
        'description', 'Write off cow asset',
        'debit_amount', 0,
        'credit_amount', cow_data.purchase_price,
        'line_type', 'asset'
      )
    );
    
    -- Add cash received if sold
    IF (disposition_record->>'sale_price')::decimal > 0 THEN
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object(
          'journal_entry_temp_id', entry_description,
          'cow_id', disposition_record->>'cow_id',
          'account_code', '1000',
          'account_name', 'Cash',
          'description', 'Cash received from sale',
          'debit_amount', (disposition_record->>'sale_price')::decimal,
          'credit_amount', 0,
          'line_type', 'asset'
        )
      );
    END IF;
    
    -- Add gain/loss entry
    IF gain_loss != 0 THEN
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object(
          'journal_entry_temp_id', entry_description,
          'cow_id', disposition_record->>'cow_id',
          'account_code', CASE WHEN gain_loss > 0 THEN '8100' ELSE '6200' END,
          'account_name', CASE WHEN gain_loss > 0 THEN 'Gain on Sale of Assets' ELSE 'Loss on Sale of Assets' END,
          'description', 'Gain/loss on cow disposition',
          'debit_amount', CASE WHEN gain_loss < 0 THEN ABS(gain_loss) ELSE 0 END,
          'credit_amount', CASE WHEN gain_loss > 0 THEN gain_loss ELSE 0 END,
          'line_type', CASE WHEN gain_loss > 0 THEN 'revenue' ELSE 'expense' END
        )
      );
    END IF;
  END LOOP;
  
  -- Persist the batch
  RETURN persist_journal_batch(journal_entries, journal_lines);
  
END;
$$ LANGUAGE plpgsql;

-- Add system logs table for tracking operations
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  level text NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb
);

-- Add index for log queries
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);

-- Grant permissions
GRANT EXECUTE ON FUNCTION persist_journal_batch TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_incomplete_journals TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_acquisition_journals_bulk TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_disposition_journals_bulk TO anon, authenticated;

-- Function for optimized monthly depreciation calculation and journal creation
CREATE OR REPLACE FUNCTION calculate_monthly_depreciation_bulk(
  company_id uuid,
  target_month int,
  target_year int,
  cow_data jsonb
) RETURNS jsonb AS $$
DECLARE
  cow_record jsonb;
  total_depreciation decimal := 0;
  cow_count int := 0;
  monthly_depreciation decimal;
  months_owned int;
  useful_life_months int := 60; -- 5 years default
  journal_lines jsonb := '[]';
  journal_entries jsonb;
  entry_description text;
BEGIN
  -- Calculate depreciation for each cow
  FOR cow_record IN SELECT * FROM jsonb_array_elements(cow_data)
  LOOP
    -- Calculate months owned as of target date
    months_owned := EXTRACT(
      MONTHS FROM AGE(
        make_date(target_year, target_month, 1),
        (cow_record->>'freshen_date')::date
      )
    );
    
    -- Only calculate if cow has been owned for at least 1 month
    IF months_owned >= 1 THEN
      -- Simple straight-line depreciation
      monthly_depreciation := GREATEST(
        ((cow_record->>'purchase_price')::decimal - (cow_record->>'salvage_value')::decimal) / useful_life_months,
        0
      );
      
      -- Don't exceed total depreciable amount
      IF months_owned >= useful_life_months THEN
        monthly_depreciation := 0; -- Fully depreciated
      END IF;
      
      total_depreciation := total_depreciation + monthly_depreciation;
      cow_count := cow_count + 1;
    END IF;
  END LOOP;
  
  -- Only create journal if there's depreciation to record
  IF total_depreciation > 0 THEN
    entry_description := 'Monthly depreciation for ' || target_month || '/' || target_year;
    
    -- Create journal entry
    journal_entries := jsonb_build_array(
      jsonb_build_object(
        'company_id', company_id,
        'entry_date', make_date(target_year, target_month, 1),
        'month', target_month,
        'year', target_year,
        'entry_type', 'depreciation',
        'description', entry_description,
        'total_amount', total_depreciation,
        'status', 'posted'
      )
    );
    
    -- Create journal lines
    journal_lines := jsonb_build_array(
      -- Debit: Depreciation Expense
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', null,
        'account_code', '6100',
        'account_name', 'Depreciation Expense - Dairy Cows',
        'description', 'Monthly depreciation expense',
        'debit_amount', total_depreciation,
        'credit_amount', 0,
        'line_type', 'expense'
      ),
      -- Credit: Accumulated Depreciation
      jsonb_build_object(
        'journal_entry_temp_id', entry_description,
        'cow_id', null,
        'account_code', '1500.1',
        'account_name', 'Accumulated Depreciation - Dairy Cows',
        'description', 'Monthly accumulated depreciation',
        'debit_amount', 0,
        'credit_amount', total_depreciation,
        'line_type', 'contra_asset'
      )
    );
    
    -- Persist the journal
    PERFORM persist_journal_batch(journal_entries, journal_lines);
  END IF;
  
  -- Return results
  RETURN jsonb_build_object(
    'success', true,
    'total_depreciation', total_depreciation,
    'cow_count', cow_count,
    'journal_created', total_depreciation > 0
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'total_depreciation', 0,
    'cow_count', 0,
    'journal_created', false
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for new function
GRANT EXECUTE ON FUNCTION calculate_monthly_depreciation_bulk TO anon, authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION persist_journal_batch IS 'Efficiently creates journal entries and lines in bulk with proper transaction handling';
COMMENT ON FUNCTION cleanup_incomplete_journals IS 'Removes incomplete journal entries older than specified time';
COMMENT ON FUNCTION create_acquisition_journals_bulk IS 'Fast bulk creation of acquisition journals for new cows';
COMMENT ON FUNCTION create_disposition_journals_bulk IS 'Fast bulk creation of disposition journals with automatic book value calculations';
COMMENT ON FUNCTION calculate_monthly_depreciation_bulk IS 'Optimized monthly depreciation calculation and journal creation for large herds';