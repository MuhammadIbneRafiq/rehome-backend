-- Migration script to add fixed date fields to item_moving table
-- Run this in Supabase SQL Editor

-- Add new columns for fixed date handling
DO $$ 
BEGIN
    -- Add pickup_date column for fixed pickup date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'pickup_date') THEN
        ALTER TABLE item_moving ADD COLUMN pickup_date DATE;
    END IF;
    
    -- Add dropoff_date column for fixed dropoff date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'dropoff_date') THEN
        ALTER TABLE item_moving ADD COLUMN dropoff_date DATE;
    END IF;
    
    -- Add date_option column to track the date selection type
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'date_option') THEN
        ALTER TABLE item_moving ADD COLUMN date_option VARCHAR(20) DEFAULT 'flexible';
    END IF;
    
    -- Add preferred_time_span column for time preference
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'preferred_time_span') THEN
        ALTER TABLE item_moving ADD COLUMN preferred_time_span VARCHAR(50);
    END IF;
    
    -- Add extra_instructions column for additional notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'extra_instructions') THEN
        ALTER TABLE item_moving ADD COLUMN extra_instructions TEXT;
    END IF;
    
    -- Add elevator fields if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'elevator_pickup') THEN
        ALTER TABLE item_moving ADD COLUMN elevator_pickup BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'elevator_dropoff') THEN
        ALTER TABLE item_moving ADD COLUMN elevator_dropoff BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add service option fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'disassembly') THEN
        ALTER TABLE item_moving ADD COLUMN disassembly BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'extra_helper') THEN
        ALTER TABLE item_moving ADD COLUMN extra_helper BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'carrying_service') THEN
        ALTER TABLE item_moving ADD COLUMN carrying_service BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'is_student') THEN
        ALTER TABLE item_moving ADD COLUMN is_student BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add student ID and store proof fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'student_id') THEN
        ALTER TABLE item_moving ADD COLUMN student_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'store_proof_photo') THEN
        ALTER TABLE item_moving ADD COLUMN store_proof_photo VARCHAR(255);
    END IF;
    
    -- Add service item breakdown fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'disassembly_items') THEN
        ALTER TABLE item_moving ADD COLUMN disassembly_items JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'extra_helper_items') THEN
        ALTER TABLE item_moving ADD COLUMN extra_helper_items JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'carrying_service_items') THEN
        ALTER TABLE item_moving ADD COLUMN carrying_service_items JSONB;
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_item_moving_pickup_date ON item_moving(pickup_date);
CREATE INDEX IF NOT EXISTS idx_item_moving_dropoff_date ON item_moving(dropoff_date);
CREATE INDEX IF NOT EXISTS idx_item_moving_date_option ON item_moving(date_option);

-- Add comments for documentation
COMMENT ON COLUMN item_moving.pickup_date IS 'Fixed pickup date when date_option is fixed';
COMMENT ON COLUMN item_moving.dropoff_date IS 'Fixed dropoff date when date_option is fixed';
COMMENT ON COLUMN item_moving.date_option IS 'Date selection type: flexible, fixed, or rehome';
COMMENT ON COLUMN item_moving.preferred_time_span IS 'Preferred time slot: morning, afternoon, evening, or anytime';
COMMENT ON COLUMN item_moving.extra_instructions IS 'Additional instructions for the moving team';
COMMENT ON COLUMN item_moving.elevator_pickup IS 'Whether elevator is available at pickup location';
COMMENT ON COLUMN item_moving.elevator_dropoff IS 'Whether elevator is available at dropoff location';
COMMENT ON COLUMN item_moving.disassembly IS 'Whether disassembly service is requested';
COMMENT ON COLUMN item_moving.extra_helper IS 'Whether extra helper service is requested';
COMMENT ON COLUMN item_moving.carrying_service IS 'Whether carrying service is requested';
COMMENT ON COLUMN item_moving.is_student IS 'Whether customer is a student for discount';
COMMENT ON COLUMN item_moving.student_id IS 'Student ID file reference for discount verification';
COMMENT ON COLUMN item_moving.store_proof_photo IS 'Store proof photo file reference for store pickups';
COMMENT ON COLUMN item_moving.disassembly_items IS 'JSON object mapping item IDs to disassembly requests';
COMMENT ON COLUMN item_moving.extra_helper_items IS 'JSON object mapping item IDs to extra helper requests';
COMMENT ON COLUMN item_moving.carrying_service_items IS 'JSON object mapping item IDs to carrying service requests';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'item_moving' 
AND column_name IN ('pickup_date', 'dropoff_date', 'date_option', 'preferred_time_span', 'extra_instructions')
ORDER BY column_name; 