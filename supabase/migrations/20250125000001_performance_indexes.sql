-- Performance optimization indexes for dairy depreciation dashboard
-- Created: 2025-01-25

-- Indexes for cows table (most queried table)
CREATE INDEX IF NOT EXISTS idx_cows_company_status 
ON cows(company_id, status);

CREATE INDEX IF NOT EXISTS idx_cows_company_freshen_date 
ON cows(company_id, freshen_date);

CREATE INDEX IF NOT EXISTS idx_cows_status_freshen_date 
ON cows(status, freshen_date) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cows_tag_number_company 
ON cows(tag_number, company_id);

-- Indexes for journal_entries table
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_month_year 
ON journal_entries(company_id, year, month);

CREATE INDEX IF NOT EXISTS idx_journal_entries_type_date 
ON journal_entries(entry_type, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_type_period 
ON journal_entries(company_id, entry_type, year, month);

-- Indexes for journal_lines table
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id 
ON journal_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_cow_id 
ON journal_lines(cow_id) 
WHERE cow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code 
ON journal_lines(account_code);

-- Indexes for cow_dispositions table
CREATE INDEX IF NOT EXISTS idx_cow_dispositions_company_date 
ON cow_dispositions(company_id, disposition_date);

CREATE INDEX IF NOT EXISTS idx_cow_dispositions_cow_id 
ON cow_dispositions(cow_id);

CREATE INDEX IF NOT EXISTS idx_cow_dispositions_type_date 
ON cow_dispositions(disposition_type, disposition_date);

-- Indexes for cow_monthly_depreciation table (if exists)
CREATE INDEX IF NOT EXISTS idx_cow_monthly_depreciation_cow_period 
ON cow_monthly_depreciation(cow_id, year, month);

CREATE INDEX IF NOT EXISTS idx_cow_monthly_depreciation_company_period 
ON cow_monthly_depreciation(company_id, year, month);

-- Indexes for company_memberships table
CREATE INDEX IF NOT EXISTS idx_company_memberships_user_id 
ON company_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_company_memberships_company_role 
ON company_memberships(company_id, role);

-- Indexes for purchase_price_defaults table
CREATE INDEX IF NOT EXISTS idx_purchase_price_defaults_birth_year 
ON purchase_price_defaults(birth_year);

-- Partial indexes for performance on common queries
CREATE INDEX IF NOT EXISTS idx_cows_active_company_freshen 
ON cows(company_id, freshen_date) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_recent 
ON journal_entries(company_id, entry_date) 
WHERE status = 'posted' AND entry_date >= (CURRENT_DATE - INTERVAL '2 years');

-- Composite index for depreciation calculations
CREATE INDEX IF NOT EXISTS idx_cows_depreciation_calc 
ON cows(company_id, status, freshen_date, purchase_price, salvage_value) 
WHERE status = 'active';

-- Index for journal entry lookups by period
CREATE INDEX IF NOT EXISTS idx_journal_entries_period_lookup 
ON journal_entries(company_id, entry_type, year DESC, month DESC);

-- Index for balance adjustments if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'balance_adjustments') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_balance_adjustments_company_period 
                 ON balance_adjustments(company_id, prior_period_year, prior_period_month)';
    END IF;
END $$;

-- Comments for index documentation
COMMENT ON INDEX idx_cows_company_status IS 'Optimizes queries filtering cows by company and status';
COMMENT ON INDEX idx_cows_company_freshen_date IS 'Optimizes depreciation calculations by freshen date';
COMMENT ON INDEX idx_journal_entries_company_month_year IS 'Optimizes monthly journal entry lookups';
COMMENT ON INDEX idx_cow_dispositions_company_date IS 'Optimizes disposition reporting queries';

-- Analyze tables to update statistics
ANALYZE cows;
ANALYZE journal_entries;
ANALYZE journal_lines;
ANALYZE cow_dispositions;
ANALYZE company_memberships;
ANALYZE purchase_price_defaults;