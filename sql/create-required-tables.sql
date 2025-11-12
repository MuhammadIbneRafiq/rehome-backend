-- Create required tables if they don't exist
-- Run this BEFORE the RPC functions script

-- 1. City Schedule Table (for tracking which cities have service on which days)
CREATE TABLE IF NOT EXISTS city_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    city_name TEXT NOT NULL,
    schedule_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(city_name, schedule_date)
);

-- 2. Blocked Dates Table
CREATE TABLE IF NOT EXISTS blocked_dates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocked_date DATE NOT NULL,
    city_name TEXT, -- NULL means globally blocked
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure city_prices table has the right structure
-- This might already exist, but let's ensure it has all required columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'city_prices') THEN
        CREATE TABLE city_prices (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            city_name TEXT UNIQUE NOT NULL,
            normal_price NUMERIC(10,2) NOT NULL,
            city_day_price NUMERIC(10,2) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Add missing columns if table exists
        ALTER TABLE city_prices ADD COLUMN IF NOT EXISTS normal_price NUMERIC(10,2);
        ALTER TABLE city_prices ADD COLUMN IF NOT EXISTS city_day_price NUMERIC(10,2);
        ALTER TABLE city_prices ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 4. Ensure furniture_items table exists with required columns
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'furniture_items') THEN
        CREATE TABLE furniture_items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            base_points INTEGER NOT NULL DEFAULT 0,
            material TEXT,
            weight NUMERIC,
            dimensions TEXT,
            description TEXT,
            image_url TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Add missing columns if table exists
        ALTER TABLE furniture_items ADD COLUMN IF NOT EXISTS base_points INTEGER DEFAULT 0;
        ALTER TABLE furniture_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 5. Ensure pricing_config table exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pricing_config') THEN
        CREATE TABLE pricing_config (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            points_to_euro_multiplier NUMERIC(10,4) DEFAULT 1,
            carrying_multiplier NUMERIC(10,4) DEFAULT 0.25,
            assembly_multiplier NUMERIC(10,4) DEFAULT 0.2,
            student_discount NUMERIC(10,4) DEFAULT 0.1,
            early_booking_discount NUMERIC(10,4) DEFAULT 0.0885,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Insert default config if none exists
        INSERT INTO pricing_config (is_active) VALUES (true);
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_city_schedule_date ON city_schedule(schedule_date);
CREATE INDEX IF NOT EXISTS idx_city_schedule_city ON city_schedule(city_name);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_date ON blocked_dates(blocked_date);
CREATE INDEX IF NOT EXISTS idx_city_prices_active ON city_prices(is_active);
CREATE INDEX IF NOT EXISTS idx_furniture_items_active ON furniture_items(is_active);

-- Insert sample data if tables are empty
-- Sample city prices
INSERT INTO city_prices (city_name, normal_price, city_day_price, is_active)
SELECT * FROM (VALUES
    ('Amsterdam', 50.00, 40.00, true),
    ('Rotterdam', 50.00, 40.00, true),
    ('The Hague', 50.00, 40.00, true),
    ('Utrecht', 50.00, 40.00, true),
    ('Eindhoven', 50.00, 40.00, true),
    ('Groningen', 50.00, 40.00, true),
    ('Tilburg', 50.00, 40.00, true),
    ('Breda', 50.00, 40.00, true),
    ('Nijmegen', 50.00, 40.00, true),
    ('Apeldoorn', 50.00, 40.00, true)
) AS v(city_name, normal_price, city_day_price, is_active)
WHERE NOT EXISTS (SELECT 1 FROM city_prices LIMIT 1);

-- Sample city schedule (next 30 days for major cities)
-- This creates a rotating schedule where each city has service every 3-4 days
DO $$
DECLARE
    start_date DATE := CURRENT_DATE;
    end_date DATE := CURRENT_DATE + INTERVAL '30 days';
    current_date DATE;
    city_names TEXT[] := ARRAY['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'];
    city TEXT;
    day_counter INTEGER := 0;
BEGIN
    -- Only insert if table is empty
    IF NOT EXISTS (SELECT 1 FROM city_schedule LIMIT 1) THEN
        current_date := start_date;
        
        WHILE current_date <= end_date LOOP
            -- Rotate through cities (each city gets ~2 days per week)
            FOREACH city IN ARRAY city_names LOOP
                -- Use modulo to create a pattern
                IF (day_counter + array_position(city_names, city)) % 3 = 0 THEN
                    INSERT INTO city_schedule (city_name, schedule_date, is_active)
                    VALUES (city, current_date, true)
                    ON CONFLICT (city_name, schedule_date) DO NOTHING;
                END IF;
            END LOOP;
            
            current_date := current_date + 1;
            day_counter := day_counter + 1;
        END LOOP;
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON city_schedule TO authenticated;
GRANT ALL ON blocked_dates TO authenticated;
GRANT ALL ON city_prices TO authenticated;
GRANT ALL ON furniture_items TO authenticated;
GRANT ALL ON pricing_config TO authenticated;

-- Enable Row Level Security (RLS) for better security
ALTER TABLE city_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE furniture_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- Create policies for read access
CREATE POLICY "Enable read access for all users" ON city_schedule FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON blocked_dates FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON city_prices FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON furniture_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON pricing_config FOR SELECT USING (true);

-- Output confirmation
DO $$
BEGIN
    RAISE NOTICE 'Tables created/verified successfully!';
    RAISE NOTICE 'Next step: Run the supabase-rpc-functions.sql script';
END $$;
