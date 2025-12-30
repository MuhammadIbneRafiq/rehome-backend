-- ============================================================================
-- INDEX OPTIMIZATION FOR SUPABASE RPC FUNCTIONS
-- Run these queries to ensure optimal index coverage
-- ============================================================================

-- ============================================================================
-- ANALYZE CURRENT INDEX USAGE
-- ============================================================================

-- Check existing indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('city_schedules', 'blocked_dates', 'pricing_config', 'city_prices', 'furniture_items')
ORDER BY tablename, indexname;

-- Check index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('city_schedules', 'blocked_dates', 'pricing_config', 'city_prices', 'furniture_items')
ORDER BY idx_scan DESC;

-- Find unused indexes (candidates for removal)
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan = 0
AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- RECOMMENDED INDEXES FOR RPC FUNCTIONS
-- ============================================================================

-- Index for get_city_schedule_status (city + date lookup)
CREATE INDEX IF NOT EXISTS idx_city_schedules_city_date 
ON city_schedules(city, date);

-- Index for date-only lookups (checking empty days)
CREATE INDEX IF NOT EXISTS idx_city_schedules_date 
ON city_schedules(date);

-- Index for is_date_blocked
CREATE INDEX IF NOT EXISTS idx_blocked_dates_date 
ON blocked_dates(date);

-- GIN index for array operations on cities
CREATE INDEX IF NOT EXISTS idx_blocked_dates_cities_gin 
ON blocked_dates USING GIN(cities);

-- Index for full_day blocking checks
CREATE INDEX IF NOT EXISTS idx_blocked_dates_full_day 
ON blocked_dates(date, is_full_day);

-- Index for pricing_config active lookup
CREATE INDEX IF NOT EXISTS idx_pricing_config_active 
ON pricing_config(is_active, created_at DESC);

-- Index for city_prices active lookup
CREATE INDEX IF NOT EXISTS idx_city_prices_active 
ON city_prices(is_active);

-- Index for furniture_items category and active status
CREATE INDEX IF NOT EXISTS idx_furniture_items_category_active 
ON furniture_items(category, is_active);

-- Composite index for furniture items lookup
CREATE INDEX IF NOT EXISTS idx_furniture_items_active_category_name 
ON furniture_items(is_active, category, name);

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Partial index for only active pricing configs
CREATE INDEX IF NOT EXISTS idx_pricing_config_active_only 
ON pricing_config(created_at DESC) 
WHERE is_active = true;

-- Partial index for only active city prices
CREATE INDEX IF NOT EXISTS idx_city_prices_active_only 
ON city_prices(city_name) 
WHERE is_active = true;

-- Partial index for only active furniture items
CREATE INDEX IF NOT EXISTS idx_furniture_items_active_only 
ON furniture_items(category, name) 
WHERE is_active = true;

-- ============================================================================
-- COVERING INDEXES (Include commonly selected columns)
-- ============================================================================

-- Covering index for city_schedules (includes all needed columns)
CREATE INDEX IF NOT EXISTS idx_city_schedules_covering 
ON city_schedules(city, date) 
INCLUDE (created_at);

-- ============================================================================
-- ANALYZE TABLES TO UPDATE STATISTICS
-- ============================================================================

ANALYZE city_schedules;
ANALYZE blocked_dates;
ANALYZE pricing_config;
ANALYZE city_prices;
ANALYZE furniture_items;

-- ============================================================================
-- VACUUM TO RECLAIM SPACE AND UPDATE STATISTICS
-- ============================================================================

VACUUM ANALYZE city_schedules;
VACUUM ANALYZE blocked_dates;
VACUUM ANALYZE pricing_config;
VACUUM ANALYZE city_prices;
VACUUM ANALYZE furniture_items;

-- ============================================================================
-- CHECK INDEX BLOAT
-- ============================================================================

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_tup_read = 0 THEN 'NO READS'
        ELSE 'ACTIVE'
    END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('city_schedules', 'blocked_dates', 'pricing_config', 'city_prices', 'furniture_items')
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- VERIFY INDEX EFFECTIVENESS
-- ============================================================================

-- Test query to verify city_schedules index is used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM city_schedules
WHERE city = 'Amsterdam' AND date = CURRENT_DATE;

-- Test query to verify blocked_dates index is used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM blocked_dates
WHERE date = CURRENT_DATE AND is_full_day = true;

-- Test query to verify GIN index on cities array
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM blocked_dates
WHERE 'Amsterdam' = ANY(cities);

-- Test query to verify pricing_config partial index
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM pricing_config
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- RECOMMENDATIONS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'INDEX OPTIMIZATION COMPLETE';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Indexes Created/Verified:';
    RAISE NOTICE '1. Composite indexes for common lookup patterns';
    RAISE NOTICE '2. Partial indexes for active records only';
    RAISE NOTICE '3. GIN indexes for array operations';
    RAISE NOTICE '4. Covering indexes to avoid table lookups';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Monitor index usage with pg_stat_user_indexes';
    RAISE NOTICE '2. Drop unused indexes to save space and write overhead';
    RAISE NOTICE '3. Run ANALYZE regularly to keep statistics current';
    RAISE NOTICE '4. Consider REINDEX if indexes become bloated';
    RAISE NOTICE '';
END $$;
