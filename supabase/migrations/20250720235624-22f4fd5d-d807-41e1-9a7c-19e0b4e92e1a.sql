-- Test the corrected gain/loss logic by regenerating April 2025
SELECT
  net.http_post(
    url:='https://qadhrhlagitqfsyfcnnr.supabase.co/functions/v1/monthly-journal-processor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZGhyaGxhZ2l0cWZzeWZjbm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5NzY1MDMsImV4cCI6MjA2ODU1MjUwM30.cKm68Bf02UUMzeyrkH6olDlWtue0gliyEBSkTIgtf_s"}'::jsonb,
    body:='{"manual": true}'::jsonb
  ) as request_id;