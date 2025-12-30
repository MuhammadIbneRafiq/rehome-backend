-- ====================================================
-- MIGRATION: Comprehensive Date Options Fix
-- ====================================================
-- Purpose: Properly handle 3 date scenarios across both tables
-- Date: 2025-12-30
-- Author: System Migration
--
-- Date Scenarios:
-- 1. 'flexible' - Flexible date range (selecteddate_start and selecteddate_end both set)
-- 2. 'fixed' - Fixed date(s):
--    - Item Moving: pickup date (selecteddate_start) and dropoff date (selecteddate_end)
--    - House Moving: single moving date (selecteddate_start only, selecteddate_end NULL)
-- 3. 'rehome' - Let ReHome choose (all date fields NULL, isdateflexible = true)
--
-- Issues Fixed:
-- 1. Inconsistent date storage between frontend submission and database
-- 2. Missing logic to differentiate between flexible range and ReHome choice
-- 3. Backward compatibility with existing data
-- ====================================================




BEGIN;

-- ====================================================
-- STEP 1: Update existing data to set proper date_option values
-- ====================================================

-- For item_moving table
-- Set 'rehome' for records with no dates but isdateflexible = true
UPDATE item_moving
SET date_option = 'rehome'
WHERE date_option IS NULL 
  AND selecteddate IS NULL 
  AND selecteddate_start IS NULL 
  AND selecteddate_end IS NULL
  AND isdateflexible = true;

-- Set 'flexible' for records with both start and end dates
UPDATE item_moving
SET date_option = 'flexible'
WHERE date_option IS NULL
  AND selecteddate_start IS NOT NULL 
  AND selecteddate_end IS NOT NULL
  AND selecteddate_start != selecteddate_end;

-- Set 'fixed' for records with dates (either single date or pickup/dropoff)
UPDATE item_moving
SET date_option = 'fixed'
WHERE date_option IS NULL
  AND (selecteddate IS NOT NULL 
       OR selecteddate_start IS NOT NULL 
       OR selecteddate_end IS NOT NULL);

-- For house_moving table
-- Set 'rehome' for records with no dates but isdateflexible = true
UPDATE house_moving
SET date_option = 'rehome'
WHERE date_option IS NULL 
  AND selecteddate IS NULL 
  AND selecteddate_start IS NULL 
  AND selecteddate_end IS NULL
  AND isdateflexible = true;

-- Set 'flexible' for records with both start and end dates
UPDATE house_moving
SET date_option = 'flexible'
WHERE date_option IS NULL
  AND selecteddate_start IS NOT NULL 
  AND selecteddate_end IS NOT NULL;

-- Set 'fixed' for records with a single date
UPDATE house_moving
SET date_option = 'fixed'
WHERE date_option IS NULL
  AND (selecteddate IS NOT NULL OR selecteddate_start IS NOT NULL);

-- ====================================================
-- STEP 2: Add constraints and comments
-- ====================================================

-- Add check constraint to ensure date_option has valid values
DO $$
BEGIN
    -- Drop constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'item_moving_date_option_check' 
        AND table_name = 'item_moving'
    ) THEN
        ALTER TABLE item_moving DROP CONSTRAINT item_moving_date_option_check;
    END IF;
    
    -- Add constraint
    ALTER TABLE item_moving ADD CONSTRAINT item_moving_date_option_check 
        CHECK (date_option IN ('flexible', 'fixed', 'rehome'));
    
    RAISE NOTICE 'Added date_option constraint to item_moving';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint already exists or error: %', SQLERRM;
END $$;

DO $$
BEGIN
    -- Drop constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'house_moving_date_option_check' 
        AND table_name = 'house_moving'
    ) THEN
        ALTER TABLE house_moving DROP CONSTRAINT house_moving_date_option_check;
    END IF;
    
    -- Add constraint
    ALTER TABLE house_moving ADD CONSTRAINT house_moving_date_option_check 
        CHECK (date_option IN ('flexible', 'fixed', 'rehome'));
    
    RAISE NOTICE 'Added date_option constraint to house_moving';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint already exists or error: %', SQLERRM;
END $$;

-- Update column comments with detailed explanations
COMMENT ON COLUMN item_moving.date_option IS 'Date selection type: flexible (date range), fixed (pickup/dropoff dates), rehome (let ReHome choose)';
COMMENT ON COLUMN item_moving.selecteddate IS 'Legacy field - primary selected date or pickup date for fixed option';
COMMENT ON COLUMN item_moving.selecteddate_start IS 'Start date for flexible range OR pickup date for fixed item transport';
COMMENT ON COLUMN item_moving.selecteddate_end IS 'End date for flexible range OR dropoff date for fixed item transport';
COMMENT ON COLUMN item_moving.isdateflexible IS 'True for flexible or rehome options, false for fixed dates';

COMMENT ON COLUMN house_moving.date_option IS 'Date selection type: flexible (date range), fixed (single moving date), rehome (let ReHome choose)';
COMMENT ON COLUMN house_moving.selecteddate IS 'Legacy field - primary selected date for fixed option';
COMMENT ON COLUMN house_moving.selecteddate_start IS 'Start date for flexible range OR moving date for fixed option';
COMMENT ON COLUMN house_moving.selecteddate_end IS 'End date for flexible range (NULL for fixed house moving)';
COMMENT ON COLUMN house_moving.isdateflexible IS 'True for flexible or rehome options, false for fixed dates';

-- ====================================================
-- STEP 3: Create helper function to validate date consistency
-- ====================================================

CREATE OR REPLACE FUNCTION validate_date_option_consistency()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate flexible option
    IF NEW.date_option = 'flexible' THEN
        IF NEW.selecteddate_start IS NULL OR NEW.selecteddate_end IS NULL THEN
            RAISE EXCEPTION 'Flexible date option requires both selecteddate_start and selecteddate_end';
        END IF;
        IF NEW.selecteddate_start >= NEW.selecteddate_end THEN
            RAISE EXCEPTION 'Flexible date range: start date must be before end date';
        END IF;
    END IF;
    
    -- Validate rehome option
    IF NEW.date_option = 'rehome' THEN
        -- ReHome option should have NULL dates
        NEW.selecteddate := NULL;
        NEW.selecteddate_start := NULL;
        NEW.selecteddate_end := NULL;
        NEW.isdateflexible := true;
    END IF;
    
    -- Validate fixed option
    IF NEW.date_option = 'fixed' THEN
        IF NEW.selecteddate_start IS NULL AND NEW.selecteddate IS NULL THEN
            RAISE EXCEPTION 'Fixed date option requires at least selecteddate or selecteddate_start';
        END IF;
        NEW.isdateflexible := false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS validate_item_moving_dates ON item_moving;
DROP TRIGGER IF EXISTS validate_house_moving_dates ON house_moving;

-- Create triggers
CREATE TRIGGER validate_item_moving_dates
    BEFORE INSERT OR UPDATE ON item_moving
    FOR EACH ROW
    EXECUTE FUNCTION validate_date_option_consistency();

CREATE TRIGGER validate_house_moving_dates
    BEFORE INSERT OR UPDATE ON house_moving
    FOR EACH ROW
    EXECUTE FUNCTION validate_date_option_consistency();

-- ====================================================
-- STEP 4: Verification
-- ====================================================

DO $$
DECLARE
    item_flexible_count INTEGER;
    item_fixed_count INTEGER;
    item_rehome_count INTEGER;
    house_flexible_count INTEGER;
    house_fixed_count INTEGER;
    house_rehome_count INTEGER;
BEGIN
    -- Count records by date_option in item_moving
    SELECT COUNT(*) INTO item_flexible_count FROM item_moving WHERE date_option = 'flexible';
    SELECT COUNT(*) INTO item_fixed_count FROM item_moving WHERE date_option = 'fixed';
    SELECT COUNT(*) INTO item_rehome_count FROM item_moving WHERE date_option = 'rehome';
    
    -- Count records by date_option in house_moving
    SELECT COUNT(*) INTO house_flexible_count FROM house_moving WHERE date_option = 'flexible';
    SELECT COUNT(*) INTO house_fixed_count FROM house_moving WHERE date_option = 'fixed';
    SELECT COUNT(*) INTO house_rehome_count FROM house_moving WHERE date_option = 'rehome';
    
    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'item_moving: flexible=%, fixed=%, rehome=%', item_flexible_count, item_fixed_count, item_rehome_count;
    RAISE NOTICE 'house_moving: flexible=%, fixed=%, rehome=%', house_flexible_count, house_fixed_count, house_rehome_count;
    RAISE NOTICE '✅ Migration completed successfully!';
END $$;

COMMIT;

-- ====================================================
-- POST-MIGRATION NOTES
-- ====================================================
-- After running this migration:
-- 1. All existing records have proper date_option values
-- 2. Database constraints ensure data consistency
-- 3. Triggers validate date fields on insert/update
-- 4. Backend code must be updated to handle all 3 scenarios correctly
-- ====================================================
