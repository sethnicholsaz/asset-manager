-- Create balance adjustment for the depreciation variance
INSERT INTO balance_adjustments (
    company_id,
    adjustment_date,
    prior_period_month,
    prior_period_year,
    adjustment_type,
    description,
    adjustment_amount,
    applied_to_current_month
) VALUES (
    '2da00486-874e-41ef-b8d4-07f3ae20868a',
    CURRENT_DATE,
    7,
    2025,
    'depreciation_variance',
    'Depreciation variance adjustment for July 2025 - correcting $126.36 difference between calculated and posted amounts',
    126.36,
    false
);