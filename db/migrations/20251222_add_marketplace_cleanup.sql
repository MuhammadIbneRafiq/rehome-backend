-- ====================================================
-- MARKETPLACE LISTING EXPIRATION (AUTO-CLEANUP)
-- Non-ReHome listings expire 45 days after last update
-- ====================================================

-- Ensure pg_cron extension exists for scheduling; harmless if already present
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function that removes expired marketplace listings (non-ReHome, older than 45 days)
CREATE OR REPLACE FUNCTION cleanup_marketplace_listings()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM marketplace_furniture
    WHERE is_rehome = false
      AND updated_at < (NOW() AT TIME ZONE 'utc') - INTERVAL '45 days';
END;
$$;

-- Run cleanup immediately when this script executes
SELECT cleanup_marketplace_listings();

-- Schedule daily cleanup at 03:00 UTC; replace any existing job with the same name
DO $cron$
DECLARE
    existing_job_id INTEGER;
BEGIN

    SELECT jobid
    INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'cleanup_marketplace_listings_daily'
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
        'cleanup_marketplace_listings_daily',
        '0 3 * * *',
        $$SELECT cleanup_marketplace_listings();$$
    );
END $cron$;