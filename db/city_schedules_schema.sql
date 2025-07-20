-- City Schedules Management Database Schema for Supabase
-- Run these SQL commands in the Supabase SQL Editor

-- Create city_schedules table
CREATE TABLE IF NOT EXISTS city_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    city TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_city_schedules_date ON city_schedules(date);
CREATE INDEX IF NOT EXISTS idx_city_schedules_city ON city_schedules(city);
CREATE INDEX IF NOT EXISTS idx_city_schedules_date_city ON city_schedules(date, city);

-- Create unique constraint to prevent duplicate city-date combinations
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_schedules_unique_date_city ON city_schedules(date, city);

-- Enable Row Level Security (RLS) 
ALTER TABLE city_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (admin access)
CREATE POLICY "Enable read access for authenticated users" ON city_schedules
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON city_schedules
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON city_schedules
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON city_schedules
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_city_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_city_schedules_updated_at
    BEFORE UPDATE ON city_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_city_schedules_updated_at();

-- Add some sample data (optional - remove if not needed)
INSERT INTO city_schedules (date, city) VALUES
    (CURRENT_DATE, 'Rotterdam'),
    (CURRENT_DATE + INTERVAL '1 day', 'Amsterdam'),
    (CURRENT_DATE + INTERVAL '2 days', 'Utrecht'),
    (CURRENT_DATE + INTERVAL '3 days', 'The Hague'),
    (CURRENT_DATE + INTERVAL '4 days', 'Eindhoven')
ON CONFLICT (date, city) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE city_schedules IS 'Manages which cities are scheduled for specific dates in the admin calendar system';
COMMENT ON COLUMN city_schedules.date IS 'The date when this city is scheduled';
COMMENT ON COLUMN city_schedules.city IS 'The city that is scheduled for this date';
COMMENT ON COLUMN city_schedules.created_at IS 'When this schedule entry was created';
COMMENT ON COLUMN city_schedules.updated_at IS 'When this schedule entry was last updated'; 