-- Migration: Add status column and update pricing constraint for free items
-- Run this SQL script in your Supabase SQL editor

-- 1. Add status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='marketplace_furniture' AND column_name='status') THEN
        ALTER TABLE marketplace_furniture 
        ADD COLUMN status VARCHAR(20) DEFAULT 'available' 
        CHECK (status IN ('available', 'reserved', 'sold'));
        
        -- Update existing data: set status based on sold field
        UPDATE marketplace_furniture 
        SET status = CASE WHEN sold THEN 'sold' ELSE 'available' END;
        
        RAISE NOTICE 'Status column added successfully';
    ELSE
        RAISE NOTICE 'Status column already exists';
    END IF;
END $$;

-- 2. Update pricing constraint to support 'free' pricing type
DO $$ 
BEGIN
    -- Drop the existing constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name='check_fixed_price' AND table_name='marketplace_furniture') THEN
        ALTER TABLE marketplace_furniture DROP CONSTRAINT check_fixed_price;
        RAISE NOTICE 'Old pricing constraint dropped';
    END IF;
    
    -- Add the new constraint that supports 'free' pricing type
    ALTER TABLE marketplace_furniture ADD CONSTRAINT check_fixed_price CHECK (
        (pricing_type = 'fixed' AND price IS NOT NULL AND price > 0 AND starting_bid IS NULL) OR
        (pricing_type = 'bidding' AND starting_bid IS NOT NULL AND starting_bid > 0 AND price IS NULL) OR
        (pricing_type = 'negotiable' AND price IS NULL AND starting_bid IS NULL) OR
        (pricing_type = 'free' AND price = 0 AND starting_bid IS NULL)
    );
    
    RAISE NOTICE 'New pricing constraint added - free pricing type now supported';
END $$;

-- 3. Create index on status column for better performance
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_status ON marketplace_furniture(status);

-- 4. Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'marketplace_furniture' AND column_name = 'status'; 