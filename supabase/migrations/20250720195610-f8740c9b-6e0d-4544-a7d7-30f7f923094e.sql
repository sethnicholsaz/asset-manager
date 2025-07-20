-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the monthly cron job to run on the 5th of each month at 6 AM UTC
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