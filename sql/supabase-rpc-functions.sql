-- Supabase RPC Functions for Optimized Pricing Calculations
-- These functions run on the database server for better performance and caching

-- 1. Function to get city schedule status with caching
CREATE OR REPLACE FUNCTION get_city_schedule_status(
  check_city text,
  check_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_scheduled boolean DEFAULT false;
  is_empty boolean DEFAULT true;
  city_count integer;
  total_cities integer;
BEGIN
  -- Check if the city has a scheduled day on this date
  SELECT EXISTS(
    SELECT 1
    FROM city_schedules
    WHERE city = check_city
    AND date = check_date
  ) INTO is_scheduled;
  
  -- Check if the calendar is completely empty for this date
  SELECT COUNT(DISTINCT city) INTO city_count
  FROM city_schedules
  WHERE date = check_date;
  
  -- Get total number of cities (hardcoded for now, can be from a cities table later)
  total_cities := 5; -- Adjust based on your cities
  
  -- If no cities are scheduled, the day is empty
  IF city_count > 0 THEN
    is_empty := false;
  END IF;
  
  RETURN jsonb_build_object(
    'isScheduled', is_scheduled,
    'isEmpty', is_empty,
    'scheduledCities', city_count,
    'totalCities', total_cities
  );
END;
$$;

-- 2. Function to get all city days in a date range
CREATE OR REPLACE FUNCTION get_city_days_in_range(
  check_city text,
  start_date date,
  end_date date
)
RETURNS jsonb[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb[];
BEGIN
  SELECT ARRAY_AGG(
    jsonb_build_object(
      'date', date,
      'isScheduled', true
    )
  ) INTO result
  FROM city_schedules
  WHERE city = check_city
  AND date BETWEEN start_date AND end_date;
  
  RETURN COALESCE(result, ARRAY[]::jsonb[]);
END;
$$;

-- 3. Optimized function to check if date is blocked
CREATE OR REPLACE FUNCTION is_date_blocked(
  check_date date,
  city_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if date is fully blocked (no cities specified or city matches)
  RETURN EXISTS (
    SELECT 1 FROM blocked_dates
    WHERE date = check_date
    AND is_full_day = true
    AND (
      cities = ARRAY[]::TEXT[] -- All cities blocked
      OR city_name = ANY(cities) -- Specific city blocked
      OR city_name IS NULL -- Checking without specific city
    )
  );
END;
$$;

-- 4. Function to get pricing configuration with caching
CREATE OR REPLACE FUNCTION get_pricing_config_cached()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  config jsonb;
BEGIN
  SELECT row_to_json(pricing_config.*) INTO config
  FROM pricing_config
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN config;
END;
$$;

-- 5. Function to get city base charges
CREATE OR REPLACE FUNCTION get_city_base_charges()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  charges jsonb;
BEGIN
  SELECT jsonb_object_agg(
    city_name,
    jsonb_build_object(
      'normal', normal_price,
      'cityDay', city_day_price
    )
  ) INTO charges
  FROM city_prices
  WHERE is_active = true;
  
  RETURN COALESCE(charges, '{}'::jsonb);
END;
$$;

-- 6. Function to get furniture items with points
CREATE OR REPLACE FUNCTION get_furniture_items_with_points()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  items jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'category', category,
      'base_points', base_points,
      'material', material,
      'weight', weight,
      'dimensions', dimensions
    )
  ) INTO items
  FROM furniture_items
  WHERE is_active = true
  ORDER BY category, name;
  
  RETURN COALESCE(items, '[]'::jsonb);
END;
$$;

-- 7. Batch function to get multiple city schedules at once
CREATE OR REPLACE FUNCTION get_batch_city_schedules(
  cities text[],
  dates date[]
)
RETURNS TABLE(
  city text,
  date date,
  is_scheduled boolean,
  is_empty boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH city_date_pairs AS (
    SELECT 
      unnest(cities) AS city,
      unnest(dates) AS date
  ),
  schedule_data AS (
    SELECT 
      cs.city,
      cs.date,
      true AS is_scheduled
    FROM city_schedules cs
    WHERE cs.city = ANY(cities)
    AND cs.date = ANY(dates)
  ),
  empty_dates AS (
    SELECT 
      d AS date,
      COUNT(DISTINCT cs.city) = 0 AS is_empty
    FROM unnest(dates) d
    LEFT JOIN city_schedules cs ON cs.date = d
    GROUP BY d
  )
  SELECT 
    cdp.city,
    cdp.date,
    COALESCE(sd.is_scheduled, false) AS is_scheduled,
    COALESCE(ed.is_empty, true) AS is_empty
  FROM city_date_pairs cdp
  LEFT JOIN schedule_data sd ON sd.city = cdp.city AND sd.date = cdp.date
  LEFT JOIN empty_dates ed ON ed.date = cdp.date;
END;
$$;

-- 8. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_city_schedules_lookup 
ON city_schedules(city, date);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_lookup 
ON blocked_dates(date);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_cities 
ON blocked_dates USING GIN(cities);

-- 9. Function to get month schedule (for fast calendar loading)
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

-- 10. Function to calculate distance-based pricing
CREATE OR REPLACE FUNCTION calculate_distance_cost(
  distance_km numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF distance_km < 10 THEN
    RETURN 0;
  ELSIF distance_km <= 50 THEN
    RETURN ROUND((distance_km - 10) * 0.7, 2);
  ELSE
    RETURN ROUND(40 * 0.7 + (distance_km - 50) * 0.5, 2);
  END IF;
END;
$$;

-- 10. Function to get blocked dates in a range
CREATE OR REPLACE FUNCTION get_blocked_dates(
  start_date date,
  end_date date,
  city_name text DEFAULT NULL
)
RETURNS TABLE (
  date date,
  is_full_day boolean,
  cities text[],
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT bd.date, bd.is_full_day, bd.cities, bd.reason
  FROM blocked_dates bd
  WHERE bd.date BETWEEN start_date AND end_date
  AND (
    bd.cities = ARRAY[]::TEXT[] -- All cities blocked
    OR city_name = ANY(bd.cities) -- Specific city blocked
    OR city_name IS NULL -- Get all blocks regardless of city
  )
  ORDER BY bd.date;
END;
$$;

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_city_schedule_status TO authenticated;
GRANT EXECUTE ON FUNCTION get_city_days_in_range TO authenticated;
GRANT EXECUTE ON FUNCTION is_date_blocked TO authenticated;
GRANT EXECUTE ON FUNCTION get_pricing_config_cached TO authenticated;
GRANT EXECUTE ON FUNCTION get_city_base_charges TO authenticated;
GRANT EXECUTE ON FUNCTION get_furniture_items_with_points TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_city_schedules TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_distance_cost TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_blocked_dates TO authenticated;

-- Also grant to anon for public booking form access
GRANT EXECUTE ON FUNCTION is_date_blocked TO anon;
GRANT EXECUTE ON FUNCTION get_month_schedule TO anon;
GRANT EXECUTE ON FUNCTION get_blocked_dates TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION get_city_schedule_status IS 'Returns the schedule status for a city on a specific date, including whether the calendar is empty';
COMMENT ON FUNCTION get_city_days_in_range IS 'Returns all scheduled city days within a date range';
COMMENT ON FUNCTION is_date_blocked IS 'Checks if a specific date is blocked globally or for a specific city';
COMMENT ON FUNCTION get_pricing_config_cached IS 'Returns the active pricing configuration';
COMMENT ON FUNCTION get_city_base_charges IS 'Returns all city base charges for normal and city day pricing';
COMMENT ON FUNCTION get_furniture_items_with_points IS 'Returns all active furniture items with their point values';
COMMENT ON FUNCTION get_batch_city_schedules IS 'Batch operation to get schedule status for multiple city-date combinations';
COMMENT ON FUNCTION calculate_distance_cost IS 'Calculates the distance-based cost component of pricing';
COMMENT ON FUNCTION get_month_schedule IS 'Efficiently fetches all schedule data for an entire month in one call';
COMMENT ON FUNCTION get_blocked_dates IS 'Get all blocked dates within a date range';
