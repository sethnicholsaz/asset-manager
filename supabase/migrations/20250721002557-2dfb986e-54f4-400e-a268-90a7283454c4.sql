-- Create the daily cron job to send disposition emails at 7 AM UTC every day
SELECT cron.schedule(
  'daily-disposition-email',
  '0 7 * * *', -- Run at 7 AM UTC every day
  $$
  SELECT
    net.http_post(
        url:='https://qadhrhlagitqfsyfcnnr.supabase.co/functions/v1/daily-disposition-email',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZGhyaGxhZ2l0cWZzeWZjbm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5NzY1MDMsImV4cCI6MjA2ODU1MjUwM30.cKm68Bf02UUMzeyrkH6olDlWtue0gliyEBSkTIgtf_s"}'::jsonb,
        body:='{"automated": true}'::jsonb
    ) as request_id;
  $$
);