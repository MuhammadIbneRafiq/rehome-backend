-- ============================================
-- COMPLETE CALENDAR AND TIME MANAGEMENT SCHEMA
-- Run this in your Supabase SQL Editor to create all calendar/time tables
-- ============================================

-- =====================================
-- 1. TIME BLOCKS TABLE
-- =====================================

-- Create time_blocks table
CREATE TABLE IF NOT EXISTS time_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    cities TEXT[] NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for time_blocks
CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);
CREATE INDEX IF NOT EXISTS idx_time_blocks_cities ON time_blocks USING GIN(cities);
CREATE INDEX IF NOT EXISTS idx_time_blocks_discount ON time_blocks(discount_percentage);

-- =====================================
-- 2. CITY SCHEDULES TABLE
-- =====================================

-- Create city_schedules table
CREATE TABLE IF NOT EXISTS city_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    city TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for city_schedules
CREATE INDEX IF NOT EXISTS idx_city_schedules_date ON city_schedules(date);
CREATE INDEX IF NOT EXISTS idx_city_schedules_city ON city_schedules(city);
CREATE INDEX IF NOT EXISTS idx_city_schedules_date_city ON city_schedules(date, city);

-- Create unique constraint to prevent duplicate city-date combinations
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_schedules_unique_date_city ON city_schedules(date, city);

-- =====================================
-- 3. CALENDAR EVENTS TABLE
-- =====================================

-- Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    google_event_id TEXT UNIQUE, -- ID from Google Calendar (if synced)
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_all_day BOOLEAN DEFAULT false,
    location TEXT,
    city TEXT, -- Extracted city for easier filtering
    event_type VARCHAR(50) DEFAULT 'moving' CHECK (event_type IN ('moving', 'maintenance', 'holiday', 'other')),
    status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT, -- Admin user who created the event
    last_synced_at TIMESTAMP WITH TIME ZONE -- When it was last synced with Google Calendar
);

-- Create indexes for calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_city ON calendar_events(city);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_id ON calendar_events(google_event_id);

-- =====================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =====================================

-- Enable RLS for all tables
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Create policies for time_blocks
CREATE POLICY "Enable read access for authenticated users" ON time_blocks
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON time_blocks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON time_blocks
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON time_blocks
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for city_schedules
CREATE POLICY "Enable read access for authenticated users" ON city_schedules
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON city_schedules
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON city_schedules
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON city_schedules
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for calendar_events
CREATE POLICY "Enable read access for authenticated users" ON calendar_events
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON calendar_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON calendar_events
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON calendar_events
    FOR DELETE USING (auth.role() = 'authenticated');

-- =====================================
-- 5. TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================

-- Create update functions for each table
CREATE OR REPLACE FUNCTION update_time_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_city_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_time_blocks_updated_at
    BEFORE UPDATE ON time_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_time_blocks_updated_at();

CREATE TRIGGER update_city_schedules_updated_at
    BEFORE UPDATE ON city_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_city_schedules_updated_at();

CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_events_updated_at();

-- =====================================
-- 6. UTILITY FUNCTIONS
-- =====================================

-- Create function to check if a city is scheduled on a given date
CREATE OR REPLACE FUNCTION is_city_scheduled(city_name TEXT, check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check both calendar_events and city_schedules tables
    RETURN EXISTS (
        SELECT 1 FROM calendar_events 
        WHERE city = city_name 
        AND start_date <= check_date 
        AND end_date >= check_date
        AND status = 'confirmed'
        AND event_type = 'moving'
    ) OR EXISTS (
        SELECT 1 FROM city_schedules 
        WHERE city = city_name 
        AND date = check_date
    );
END;
$$ language 'plpgsql';

-- Create function to check if a date is empty (for early booking discounts)
CREATE OR REPLACE FUNCTION is_empty_calendar_day(check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM calendar_events 
        WHERE start_date <= check_date 
        AND end_date >= check_date
        AND status = 'confirmed'
        AND event_type = 'moving'
    ) AND NOT EXISTS (
        SELECT 1 FROM city_schedules 
        WHERE date = check_date
    );
END;
$$ language 'plpgsql';

-- Create function to get available time blocks for a date
CREATE OR REPLACE FUNCTION get_time_blocks_for_date(check_date DATE)
RETURNS TABLE (
    id UUID,
    start_time TIME,
    end_time TIME,
    cities TEXT[],
    discount_percentage DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT tb.id, tb.start_time, tb.end_time, tb.cities, tb.discount_percentage
    FROM time_blocks tb
    WHERE tb.date = check_date
    ORDER BY tb.start_time;
END;
$$ language 'plpgsql';

-- =====================================
-- 7. SAMPLE DATA (OPTIONAL - REMOVE IF NOT NEEDED)
-- =====================================

-- Insert sample time blocks
INSERT INTO time_blocks (date, start_time, end_time, cities, discount_percentage) VALUES
    (CURRENT_DATE, '08:00', '15:00', ARRAY['Rotterdam', 'Amsterdam'], 20.00),
    (CURRENT_DATE + INTERVAL '1 day', '09:00', '17:00', ARRAY['Utrecht', 'Delft'], 15.00),
    (CURRENT_DATE + INTERVAL '2 days', '10:00', '14:00', ARRAY['Den Haag'], 25.00)
ON CONFLICT DO NOTHING;

-- Insert sample city schedules
INSERT INTO city_schedules (date, city) VALUES
    (CURRENT_DATE, 'Rotterdam'),
    (CURRENT_DATE + INTERVAL '1 day', 'Amsterdam'),
    (CURRENT_DATE + INTERVAL '2 days', 'Utrecht'),
    (CURRENT_DATE + INTERVAL '3 days', 'The Hague'),
    (CURRENT_DATE + INTERVAL '4 days', 'Eindhoven')
ON CONFLICT (date, city) DO NOTHING;

-- Insert sample calendar events
INSERT INTO calendar_events (title, description, start_date, end_date, start_time, end_time, city, event_type) VALUES
    ('Amsterdam City Day', 'Scheduled delivery day for Amsterdam region', CURRENT_DATE, CURRENT_DATE, '08:00', '17:00', 'Amsterdam', 'moving'),
    ('Rotterdam Route', 'Transportation services in Rotterdam area', CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', '09:00', '16:00', 'Rotterdam', 'moving'),
    ('Utrecht Schedule', 'Moving services for Utrecht region', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '2 days', '08:30', '16:30', 'Utrecht', 'moving'),
    ('Holiday Break', 'No services available', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '12 days', NULL, NULL, NULL, 'holiday'),
    ('Equipment Maintenance', 'Truck maintenance day', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '15 days', '08:00', '12:00', NULL, 'maintenance')
ON CONFLICT DO NOTHING;

-- =====================================
-- 8. DOCUMENTATION COMMENTS
-- =====================================

-- Table comments
COMMENT ON TABLE time_blocks IS 'Time blocks for scheduling with city assignments and discount percentages';
COMMENT ON TABLE city_schedules IS 'Manages which cities are scheduled for specific dates in the admin calendar system';
COMMENT ON TABLE calendar_events IS 'Local calendar events for backup/caching when Google Calendar API is unavailable';

-- Column comments for time_blocks
COMMENT ON COLUMN time_blocks.date IS 'The date this time block applies to';
COMMENT ON COLUMN time_blocks.start_time IS 'Start time of the time block';
COMMENT ON COLUMN time_blocks.end_time IS 'End time of the time block';
COMMENT ON COLUMN time_blocks.cities IS 'Array of cities covered during this time block';
COMMENT ON COLUMN time_blocks.discount_percentage IS 'Discount percentage applied during this time block';

-- Column comments for city_schedules
COMMENT ON COLUMN city_schedules.date IS 'The date when this city is scheduled';
COMMENT ON COLUMN city_schedules.city IS 'The city that is scheduled for this date';

-- Column comments for calendar_events
COMMENT ON COLUMN calendar_events.google_event_id IS 'Reference to Google Calendar event ID for synchronization';
COMMENT ON COLUMN calendar_events.title IS 'Event title/summary';
COMMENT ON COLUMN calendar_events.description IS 'Detailed description of the event';
COMMENT ON COLUMN calendar_events.start_date IS 'Event start date';
COMMENT ON COLUMN calendar_events.end_date IS 'Event end date';
COMMENT ON COLUMN calendar_events.start_time IS 'Event start time (NULL for all-day events)';
COMMENT ON COLUMN calendar_events.end_time IS 'Event end time (NULL for all-day events)';
COMMENT ON COLUMN calendar_events.is_all_day IS 'Whether this is an all-day event';
COMMENT ON COLUMN calendar_events.location IS 'Event location/address';
COMMENT ON COLUMN calendar_events.city IS 'Primary city for this event (extracted from location)';
COMMENT ON COLUMN calendar_events.event_type IS 'Type of event: moving, maintenance, holiday, other';
COMMENT ON COLUMN calendar_events.status IS 'Event status: confirmed, tentative, cancelled';
COMMENT ON COLUMN calendar_events.created_by IS 'Admin user who created this event';
COMMENT ON COLUMN calendar_events.last_synced_at IS 'When this event was last synchronized with Google Calendar';

-- Function comments
COMMENT ON FUNCTION is_city_scheduled(TEXT, DATE) IS 'Check if a city is scheduled on a given date (checks both calendar_events and city_schedules)';
COMMENT ON FUNCTION is_empty_calendar_day(DATE) IS 'Check if a date has no scheduled events (for early booking discounts)';
COMMENT ON FUNCTION get_time_blocks_for_date(DATE) IS 'Get all time blocks available for a specific date';

-- =====================================
-- SETUP COMPLETE!
-- =====================================

-- All calendar and time-related tables have been created with:
-- ✅ Time blocks for discount scheduling
-- ✅ City schedules for admin calendar management
-- ✅ Calendar events for local event storage/caching
-- ✅ Row Level Security (RLS) policies
-- ✅ Auto-updating timestamps
-- ✅ Utility functions for calendar operations
-- ✅ Sample data for testing
-- ✅ Comprehensive documentation 