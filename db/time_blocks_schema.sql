-- Time Blocks Management Database Schema for Supabase
-- Run these SQL commands in the Supabase SQL Editor

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);
CREATE INDEX IF NOT EXISTS idx_time_blocks_cities ON time_blocks USING GIN(cities);
CREATE INDEX IF NOT EXISTS idx_time_blocks_discount ON time_blocks(discount_percentage);

-- Enable Row Level Security (RLS) 
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (admin access)
CREATE POLICY "Enable read access for authenticated users" ON time_blocks
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON time_blocks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON time_blocks
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON time_blocks
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_time_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_time_blocks_updated_at
    BEFORE UPDATE ON time_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_time_blocks_updated_at();

-- Add some sample data (optional - remove if not needed)
INSERT INTO time_blocks (date, start_time, end_time, cities, discount_percentage) VALUES
    ('2024-12-20', '08:00', '15:00', ARRAY['Rotterdam', 'Amsterdam'], 20.00),
    ('2024-12-21', '09:00', '17:00', ARRAY['Utrecht', 'Delft'], 15.00),
    ('2024-12-22', '10:00', '14:00', ARRAY['Den Haag'], 25.00)
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE time_blocks IS 'Time blocks for scheduling with city assignments and discount percentages';
COMMENT ON COLUMN time_blocks.date IS 'The date this time block applies to';
COMMENT ON COLUMN time_blocks.start_time IS 'Start time of the time block';
COMMENT ON COLUMN time_blocks.end_time IS 'End time of the time block';
COMMENT ON COLUMN time_blocks.cities IS 'Array of cities covered during this time block';
COMMENT ON COLUMN time_blocks.discount_percentage IS 'Discount percentage applied during this time block'; 