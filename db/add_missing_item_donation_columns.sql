-- Add missing columns to item_donations table
-- These columns are referenced in the backend code but don't exist in the schema

ALTER TABLE item_donations 
ADD COLUMN IF NOT EXISTS elevator_available BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS floor VARCHAR(10),
ADD COLUMN IF NOT EXISTS preferred_time_span VARCHAR(50);

-- Add comments for documentation
COMMENT ON COLUMN item_donations.elevator_available IS 'Whether elevator is available at pickup location';
COMMENT ON COLUMN item_donations.floor IS 'Floor number for pickup location';
COMMENT ON COLUMN item_donations.preferred_time_span IS 'Preferred time span for pickup (morning, afternoon, evening, anytime)'; 