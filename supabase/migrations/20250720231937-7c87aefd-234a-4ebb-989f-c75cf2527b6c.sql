-- Add journal processing day setting to depreciation_settings table
ALTER TABLE public.depreciation_settings 
ADD COLUMN journal_processing_day INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.depreciation_settings.journal_processing_day IS 'Day of month to run monthly journal processing (1-28)';

-- Update the cron job to run monthly on the 5th at 6 AM UTC (instead of current month)
SELECT cron.unschedule('monthly-journal-processing');

SELECT cron.schedule(
  'monthly-journal-processing',
  '0 6 5 * *', -- Run at 6 AM UTC on the 5th of every month
  $$
  SELECT
    net.http_post(
        url:='https://qadhrhlagitqfsyfcnnr.supabase.co/functions/v1/monthly-journal-processor',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZGhyaGxhZ2l0cWZzeWZjbm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5NzY1MDMsImV4cCI6MjA2ODU1MjUwM30.cKm68Bf02UUMzeyrkH6olDlWtue0gliyEBSkTIgtf_s"}'::jsonb,
        body:='{"automated": true}'::jsonb
    ) as request_id;
  $$
);