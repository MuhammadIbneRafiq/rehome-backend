-- ============================================
-- BLOCKED DATES MANAGEMENT SCHEMA
-- Run this in your Supabase SQL Editor to create blocked dates functionality
-- ============================================

-- =====================================
-- 1. BLOCKED DATES TABLE
-- =====================================

-- Create blocked_dates table for complete day blocks
CREATE TABLE IF NOT EXISTS blocked_dates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    cities TEXT[] DEFAULT ARRAY[]::TEXT[], -- Empty array means all cities blocked
    reason TEXT, -- Optional: "Holiday", "Maintenance", etc.
    is_full_day BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT -- Admin user who created the block
);

-- Create indexes for blocked_dates
CREATE INDEX IF NOT EXISTS idx_blocked_dates_date ON blocked_dates(date);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_cities ON blocked_dates USING GIN(cities);

-- Create unique constraint to prevent duplicate date blocks for same cities
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_dates_unique_date ON blocked_dates(date) 
    WHERE is_full_day = true AND cities = ARRAY[]::TEXT[];

-- =====================================
-- 2. ROW LEVEL SECURITY (DISABLED)
-- =====================================

-- Ensure RLS is disabled so public API access can manage blocked dates
ALTER TABLE blocked_dates DISABLE ROW LEVEL SECURITY;

-- =====================================
-- 3. TRIGGERS FOR UPDATED_AT
-- =====================================

-- Create function to automatically update updated_at column for blocked_dates
CREATE OR REPLACE FUNCTION update_blocked_dates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it already exists to avoid duplicate creation
DROP TRIGGER IF EXISTS update_blocked_dates_updated_at ON blocked_dates;

-- Create trigger for blocked_dates
CREATE TRIGGER update_blocked_dates_updated_at
    BEFORE UPDATE ON blocked_dates
    FOR EACH ROW
    EXECUTE FUNCTION update_blocked_dates_updated_at();

-- =====================================
-- 4. HELPER FUNCTIONS
-- =====================================

-- Function to check if a date is blocked for a specific city
CREATE OR REPLACE FUNCTION is_date_blocked(
    check_date DATE,
    city_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
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
$$ language 'plpgsql';

-- Function to get all blocked dates for a date range
CREATE OR REPLACE FUNCTION get_blocked_dates(
    start_date DATE,
    end_date DATE,
    city_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    date DATE,
    is_full_day BOOLEAN,
    cities TEXT[],
    reason TEXT
) AS $$
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
$$ language 'plpgsql';

-- =====================================
-- 5. COMMENTS
-- =====================================

COMMENT ON TABLE blocked_dates IS 'Stores dates that are completely blocked from booking';
COMMENT ON COLUMN blocked_dates.cities IS 'Empty array means all cities are blocked; otherwise only specified cities';
COMMENT ON FUNCTION is_date_blocked IS 'Check if a specific date is blocked for booking';
COMMENT ON FUNCTION get_blocked_dates IS 'Get all blocked dates within a date range';


