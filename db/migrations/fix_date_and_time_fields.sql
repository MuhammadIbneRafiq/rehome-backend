-- ====================================================
-- MIGRATION: Fix Date and Time Fields in Moving Tables
-- ====================================================
-- Purpose: Standardize date/time columns and ensure proper storage
-- Date: 2025-12-30
-- Author: System Migration
--
-- Issues Fixed:
-- 1. item_moving table missing 'preferredtimespan' column (only has preferred_time_span)
-- 2. Both tables not properly storing flexible date ranges (selecteddate_start/end remain null)
-- 3. Inconsistent column naming between tables
--
-- Changes:
-- 1. Add 'preferredtimespan' column to item_moving for consistency with house_moving
-- 2. Sync data from preferred_time_span to preferredtimespan
-- 3. Add comments to clarify column usage
-- ====================================================

-- Start transaction
BEGIN;

-- ====================================================
-- ITEM_MOVING TABLE FIXES
-- ====================================================

-- Add preferredtimespan column to item_moving if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'preferredtimespan'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN preferredtimespan VARCHAR(50);
        RAISE NOTICE 'Added preferredtimespan column to item_moving table';
    ELSE
        RAISE NOTICE 'Column preferredtimespan already exists in item_moving table';
    END IF;
END $$;

-- Sync existing data from preferred_time_span to preferredtimespan
UPDATE item_moving 
SET preferredtimespan = preferred_time_span 
WHERE preferred_time_span IS NOT NULL AND (preferredtimespan IS NULL OR preferredtimespan = '');

-- ====================================================
-- ADD COLUMN COMMENTS FOR CLARITY
-- ====================================================

-- Item Moving Table Comments
COMMENT ON COLUMN item_moving.selecteddate IS 'Primary selected date (for fixed dates) or start date';
COMMENT ON COLUMN item_moving.selecteddate_start IS 'Start date for flexible date ranges or pickup date for item transport';
COMMENT ON COLUMN item_moving.selecteddate_end IS 'End date for flexible date ranges or dropoff date for item transport';
COMMENT ON COLUMN item_moving.isdateflexible IS 'Whether the customer selected flexible date option';
COMMENT ON COLUMN item_moving.preferred_time_span IS 'Preferred time of day (morning/afternoon/evening) - legacy column';
COMMENT ON COLUMN item_moving.preferredtimespan IS 'Preferred time of day (morning/afternoon/evening) - standardized column';

-- House Moving Table Comments
COMMENT ON COLUMN house_moving.selecteddate IS 'Primary selected date (for fixed dates) or start date';
COMMENT ON COLUMN house_moving.selecteddate_start IS 'Start date for flexible date ranges';
COMMENT ON COLUMN house_moving.selecteddate_end IS 'End date for flexible date ranges';
COMMENT ON COLUMN house_moving.isdateflexible IS 'Whether the customer selected flexible date option';
COMMENT ON COLUMN house_moving.preferred_time_span IS 'Preferred time of day (morning/afternoon/evening) - legacy column';
COMMENT ON COLUMN house_moving.preferredtimespan IS 'Preferred time of day (morning/afternoon/evening) - standardized column';

-- ====================================================
-- CREATE INDEX FOR BETTER QUERY PERFORMANCE
-- ====================================================

-- Add indexes on date columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_item_moving_selecteddate_start ON item_moving(selecteddate_start);
CREATE INDEX IF NOT EXISTS idx_item_moving_selecteddate_end ON item_moving(selecteddate_end);
CREATE INDEX IF NOT EXISTS idx_item_moving_isdateflexible ON item_moving(isdateflexible);

CREATE INDEX IF NOT EXISTS idx_house_moving_selecteddate_start ON house_moving(selecteddate_start);
CREATE INDEX IF NOT EXISTS idx_house_moving_selecteddate_end ON house_moving(selecteddate_end);
CREATE INDEX IF NOT EXISTS idx_house_moving_isdateflexible ON house_moving(isdateflexible);

-- ====================================================
-- VERIFICATION QUERIES
-- ====================================================

-- Verify the migration
DO $$
DECLARE
    item_moving_preferredtimespan_exists BOOLEAN;
    item_moving_preferred_time_span_exists BOOLEAN;
    house_moving_preferredtimespan_exists BOOLEAN;
    house_moving_preferred_time_span_exists BOOLEAN;
BEGIN
    -- Check item_moving columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'preferredtimespan'
    ) INTO item_moving_preferredtimespan_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'preferred_time_span'
    ) INTO item_moving_preferred_time_span_exists;
    
    -- Check house_moving columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'preferredtimespan'
    ) INTO house_moving_preferredtimespan_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'preferred_time_span'
    ) INTO house_moving_preferred_time_span_exists;
    
    -- Report results
    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'item_moving.preferredtimespan exists: %', item_moving_preferredtimespan_exists;
    RAISE NOTICE 'item_moving.preferred_time_span exists: %', item_moving_preferred_time_span_exists;
    RAISE NOTICE 'house_moving.preferredtimespan exists: %', house_moving_preferredtimespan_exists;
    RAISE NOTICE 'house_moving.preferred_time_span exists: %', house_moving_preferred_time_span_exists;
    
    IF item_moving_preferredtimespan_exists AND house_moving_preferredtimespan_exists THEN
        RAISE NOTICE '✅ Migration completed successfully!';
    ELSE
        RAISE WARNING '⚠️  Migration may have issues - please verify manually';
    END IF;
END $$;

-- Commit transaction
COMMIT;

-- ====================================================
-- POST-MIGRATION NOTES
-- ====================================================
-- After running this migration:
-- 1. Update backend code to use 'preferredtimespan' consistently
-- 2. Update item_moving submission to properly save selectedDateRange to selecteddate_start/end
-- 3. Both preferred_time_span and preferredtimespan columns will exist for backward compatibility
-- 4. Frontend should continue to work with both column names during transition period
-- ====================================================
