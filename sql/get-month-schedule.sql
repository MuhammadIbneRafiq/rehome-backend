-- Supabase RPC Function: get_month_schedule
-- Fetches all schedule data for a given month to minimize API calls
-- Returns schedule info for each day including assigned cities

CREATE OR REPLACE FUNCTION get_month_schedule(
  start_date date,
  end_date date
)
RETURNS TABLE (
  schedule_date date,
  assigned_cities text[],
  is_empty boolean,
  total_scheduled_cities integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS day
  ),
  daily_schedules AS (
    SELECT 
      cs.date AS schedule_date,
      ARRAY_AGG(DISTINCT cs.city) AS assigned_cities,
      COUNT(DISTINCT cs.city) AS city_count
    FROM city_schedules cs
    WHERE cs.date BETWEEN start_date AND end_date
    GROUP BY cs.date
  )
  SELECT 
    ds.day AS schedule_date,
    COALESCE(dsch.assigned_cities, ARRAY[]::text[]) AS assigned_cities,
    CASE 
      WHEN dsch.city_count IS NULL OR dsch.city_count = 0 THEN true
      ELSE false
    END AS is_empty,
    COALESCE(dsch.city_count, 0)::integer AS total_scheduled_cities
  FROM date_series ds
  LEFT JOIN daily_schedules dsch ON ds.day = dsch.schedule_date
  ORDER BY ds.day;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_month_schedule(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_schedule(date, date) TO anon;
