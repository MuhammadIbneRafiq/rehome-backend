-- Calendar Events Database Schema for Supabase
-- This table serves as a backup/cache for calendar events when Google Calendar API is unavailable
-- Run these SQL commands in the Supabase SQL Editor

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_city ON calendar_events(city);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_id ON calendar_events(google_event_id);

-- Enable Row Level Security (RLS) 
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (admin access)
CREATE POLICY "Enable read access for authenticated users" ON calendar_events
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON calendar_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON calendar_events
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON calendar_events
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_events_updated_at();

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

-- Add some sample data (optional - remove if not needed)
INSERT INTO calendar_events (title, description, start_date, end_date, start_time, end_time, city, event_type) VALUES
    ('Amsterdam City Day', 'Scheduled delivery day for Amsterdam region', CURRENT_DATE, CURRENT_DATE, '08:00', '17:00', 'Amsterdam', 'moving'),
    ('Rotterdam Route', 'Transportation services in Rotterdam area', CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', '09:00', '16:00', 'Rotterdam', 'moving'),
    ('Utrecht Schedule', 'Moving services for Utrecht region', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '2 days', '08:30', '16:30', 'Utrecht', 'moving'),
    ('Holiday Break', 'No services available', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '12 days', NULL, NULL, NULL, 'holiday'),
    ('Equipment Maintenance', 'Truck maintenance day', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '15 days', '08:00', '12:00', NULL, 'maintenance')
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE calendar_events IS 'Local calendar events for backup/caching when Google Calendar API is unavailable';
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

COMMENT ON FUNCTION is_city_scheduled(TEXT, DATE) IS 'Check if a city is scheduled on a given date (checks both calendar_events and city_schedules)';
COMMENT ON FUNCTION is_empty_calendar_day(DATE) IS 'Check if a date has no scheduled events (for early booking discounts)'; 