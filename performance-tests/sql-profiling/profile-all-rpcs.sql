-- ============================================================================
-- SUPABASE RPC PERFORMANCE PROFILING SUITE
-- Run these queries in Supabase SQL Editor to analyze RPC function performance
-- ============================================================================

-- Enable timing and detailed analysis
\timing on

-- ============================================================================
-- 1. PROFILE: get_city_schedule_status
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_schedule_status('Amsterdam', '2025-02-15'::date);

-- Test with multiple cities
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_schedule_status('Rotterdam', CURRENT_DATE + interval '7 days');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_schedule_status('Utrecht', CURRENT_DATE + interval '30 days');

-- ============================================================================
-- 2. PROFILE: get_city_days_in_range
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_days_in_range('Amsterdam', CURRENT_DATE, CURRENT_DATE + interval '30 days');

-- Test with longer range (3 months)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_days_in_range('Rotterdam', CURRENT_DATE, CURRENT_DATE + interval '90 days');

-- ============================================================================
-- 3. PROFILE: is_date_blocked
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT is_date_blocked('2025-02-15'::date, 'Amsterdam');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT is_date_blocked('2025-02-15'::date, NULL);

-- ============================================================================
-- 4. PROFILE: get_pricing_config_cached
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_pricing_config_cached();

-- ============================================================================
-- 5. PROFILE: get_city_base_charges
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_city_base_charges();

-- ============================================================================
-- 6. PROFILE: get_furniture_items_with_points
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT get_furniture_items_with_points();

-- ============================================================================
-- 7. PROFILE: get_batch_city_schedules
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT * FROM get_batch_city_schedules(
    ARRAY['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'],
    ARRAY[
        CURRENT_DATE,
        CURRENT_DATE + 1,
        CURRENT_DATE + 2,
        CURRENT_DATE + 3,
        CURRENT_DATE + 4,
        CURRENT_DATE + 5,
        CURRENT_DATE + 6,
        CURRENT_DATE + 7
    ]
);

-- ============================================================================
-- 8. PROFILE: calculate_distance_cost
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT calculate_distance_cost(5);

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT calculate_distance_cost(25);

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT calculate_distance_cost(75);

-- ============================================================================
-- 9. PROFILE: get_month_schedule
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT * FROM get_month_schedule(
    CURRENT_DATE,
    CURRENT_DATE + interval '30 days'
);

-- Test with 3-month range
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT * FROM get_month_schedule(
    CURRENT_DATE,
    CURRENT_DATE + interval '90 days'
);

-- ============================================================================
-- 10. PROFILE: get_blocked_dates
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT * FROM get_blocked_dates(
    CURRENT_DATE,
    CURRENT_DATE + interval '30 days',
    'Amsterdam'
);

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING)
SELECT * FROM get_blocked_dates(
    CURRENT_DATE,
    CURRENT_DATE + interval '30 days',
    NULL
);

-- ============================================================================
-- PERFORMANCE BENCHMARKS - Run multiple times to get average
-- ============================================================================

-- Benchmark 1: Sequential city schedule checks (typical user flow)
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration interval;
    i integer;
BEGIN
    start_time := clock_timestamp();
    
    FOR i IN 1..100 LOOP
        PERFORM get_city_schedule_status('Amsterdam', CURRENT_DATE + (i % 30));
    END LOOP;
    
    end_time := clock_timestamp();
    duration := end_time - start_time;
    
    RAISE NOTICE 'Sequential 100 city_schedule_status calls: %', duration;
    RAISE NOTICE 'Average per call: % ms', EXTRACT(MILLISECONDS FROM duration) / 100;
END $$;

-- Benchmark 2: Batch operations vs individual calls
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration_batch interval;
    duration_individual interval;
    i integer;
BEGIN
    -- Test batch operation
    start_time := clock_timestamp();
    
    PERFORM * FROM get_batch_city_schedules(
        ARRAY['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'],
        ARRAY[
            CURRENT_DATE, CURRENT_DATE + 1, CURRENT_DATE + 2, CURRENT_DATE + 3,
            CURRENT_DATE + 4, CURRENT_DATE + 5, CURRENT_DATE + 6, CURRENT_DATE + 7
        ]
    );
    
    end_time := clock_timestamp();
    duration_batch := end_time - start_time;
    
    -- Test individual operations
    start_time := clock_timestamp();
    
    FOR i IN 0..7 LOOP
        PERFORM get_city_schedule_status('Amsterdam', CURRENT_DATE + i);
        PERFORM get_city_schedule_status('Rotterdam', CURRENT_DATE + i);
        PERFORM get_city_schedule_status('Utrecht', CURRENT_DATE + i);
        PERFORM get_city_schedule_status('Den Haag', CURRENT_DATE + i);
        PERFORM get_city_schedule_status('Eindhoven', CURRENT_DATE + i);
    END LOOP;
    
    end_time := clock_timestamp();
    duration_individual := end_time - start_time;
    
    RAISE NOTICE 'Batch operation (40 checks): %', duration_batch;
    RAISE NOTICE 'Individual operations (40 checks): %', duration_individual;
    RAISE NOTICE 'Performance improvement: %x faster', 
        ROUND((EXTRACT(MILLISECONDS FROM duration_individual) / 
               EXTRACT(MILLISECONDS FROM duration_batch))::numeric, 2);
END $$;

-- Benchmark 3: Month schedule loading
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration interval;
BEGIN
    start_time := clock_timestamp();
    
    PERFORM * FROM get_month_schedule(
        CURRENT_DATE,
        CURRENT_DATE + interval '90 days'
    );
    
    end_time := clock_timestamp();
    duration := end_time - start_time;
    
    RAISE NOTICE 'Month schedule (90 days): %', duration;
END $$;

-- Benchmark 4: Pricing config retrieval (should be fast due to STABLE)
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration interval;
    i integer;
BEGIN
    start_time := clock_timestamp();
    
    FOR i IN 1..1000 LOOP
        PERFORM get_pricing_config_cached();
    END LOOP;
    
    end_time := clock_timestamp();
    duration := end_time - start_time;
    
    RAISE NOTICE '1000 pricing config calls: %', duration;
    RAISE NOTICE 'Average per call: % ms', EXTRACT(MILLISECONDS FROM duration) / 1000;
END $$;

-- ============================================================================
-- INDEX ANALYSIS - Check if indexes are being used
-- ============================================================================

-- Check city_schedules index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM city_schedules
WHERE city = 'Amsterdam' AND date = CURRENT_DATE;

-- Check blocked_dates index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM blocked_dates
WHERE date = CURRENT_DATE;

-- Check if GIN index on cities array is used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM blocked_dates
WHERE 'Amsterdam' = ANY(cities);

-- ============================================================================
-- CACHE EFFECTIVENESS ANALYSIS
-- ============================================================================

-- Check query plan cache
SELECT * FROM pg_stat_statements
WHERE query LIKE '%get_city_schedule_status%'
ORDER BY calls DESC
LIMIT 10;

-- Check table statistics
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename IN ('city_schedules', 'blocked_dates', 'pricing_config', 'city_prices', 'furniture_items')
ORDER BY tablename;

-- ============================================================================
-- BOTTLENECK IDENTIFICATION
-- ============================================================================

-- Find slow queries in the last hour
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    stddev_exec_time
FROM pg_stat_statements
WHERE query LIKE '%get_%' OR query LIKE '%calculate_%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ============================================================================
-- RECOMMENDATIONS OUTPUT
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'PERFORMANCE PROFILING COMPLETE';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Review the EXPLAIN ANALYZE output above for:';
    RAISE NOTICE '1. Sequential Scans (Seq Scan) - should be minimal';
    RAISE NOTICE '2. Index Scans - should be used for lookups';
    RAISE NOTICE '3. Execution time - target < 10ms for simple queries';
    RAISE NOTICE '4. Buffers - shared hit ratio should be high (cached)';
    RAISE NOTICE '';
    RAISE NOTICE 'Key Metrics to Monitor:';
    RAISE NOTICE '- Planning Time: Should be < 1ms';
    RAISE NOTICE '- Execution Time: Should be < 10ms for most RPCs';
    RAISE NOTICE '- Shared Buffers Hit: Should be > 95%% (good caching)';
    RAISE NOTICE '- Rows Returned: Should match expected dataset size';
    RAISE NOTICE '';
END $$;
