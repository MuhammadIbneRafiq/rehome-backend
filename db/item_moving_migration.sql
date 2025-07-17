-- Migration script for item_moving table
-- Run this in Supabase SQL Editor

-- First, let's check and create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS item_moving (
    id SERIAL PRIMARY KEY
);

-- Add columns that might be missing (using IF NOT EXISTS equivalent for PostgreSQL)
DO $$ 
BEGIN
    -- Core contact fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'email') THEN
        ALTER TABLE item_moving ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'firstname') THEN
        ALTER TABLE item_moving ADD COLUMN firstname VARCHAR(100) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'lastname') THEN
        ALTER TABLE item_moving ADD COLUMN lastname VARCHAR(100) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'phone') THEN
        ALTER TABLE item_moving ADD COLUMN phone VARCHAR(20);
    END IF;

    -- Pickup and service details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'pickuptype') THEN
        ALTER TABLE item_moving ADD COLUMN pickuptype VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'furnitureitems') THEN
        ALTER TABLE item_moving ADD COLUMN furnitureitems JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'customitem') THEN
        ALTER TABLE item_moving ADD COLUMN customitem TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'floorpickup') THEN
        ALTER TABLE item_moving ADD COLUMN floorpickup INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'floordropoff') THEN
        ALTER TABLE item_moving ADD COLUMN floordropoff INTEGER DEFAULT 0;
    END IF;

    -- Pricing fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'estimatedprice') THEN
        ALTER TABLE item_moving ADD COLUMN estimatedprice DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'baseprice') THEN
        ALTER TABLE item_moving ADD COLUMN baseprice DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'itempoints') THEN
        ALTER TABLE item_moving ADD COLUMN itempoints INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'carryingcost') THEN
        ALTER TABLE item_moving ADD COLUMN carryingcost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'disassemblycost') THEN
        ALTER TABLE item_moving ADD COLUMN disassemblycost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'distancecost') THEN
        ALTER TABLE item_moving ADD COLUMN distancecost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'extrahelpercost') THEN
        ALTER TABLE item_moving ADD COLUMN extrahelpercost DECIMAL(10,2);
    END IF;

    -- Date and scheduling
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'selecteddate') THEN
        ALTER TABLE item_moving ADD COLUMN selecteddate DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'selecteddate_start') THEN
        ALTER TABLE item_moving ADD COLUMN selecteddate_start DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'selecteddate_end') THEN
        ALTER TABLE item_moving ADD COLUMN selecteddate_end DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'isdateflexible') THEN
        ALTER TABLE item_moving ADD COLUMN isdateflexible BOOLEAN DEFAULT FALSE;
    END IF;

    -- Location fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'firstlocation') THEN
        ALTER TABLE item_moving ADD COLUMN firstlocation TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'secondlocation') THEN
        ALTER TABLE item_moving ADD COLUMN secondlocation TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'firstlocation_coords') THEN
        ALTER TABLE item_moving ADD COLUMN firstlocation_coords JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'secondlocation_coords') THEN
        ALTER TABLE item_moving ADD COLUMN secondlocation_coords JSONB;
    END IF;

    -- Distance calculation results
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'calculated_distance_km') THEN
        ALTER TABLE item_moving ADD COLUMN calculated_distance_km DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'calculated_duration_seconds') THEN
        ALTER TABLE item_moving ADD COLUMN calculated_duration_seconds INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'calculated_duration_text') THEN
        ALTER TABLE item_moving ADD COLUMN calculated_duration_text VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'distance_provider') THEN
        ALTER TABLE item_moving ADD COLUMN distance_provider VARCHAR(50);
    END IF;

    -- Timestamp fields - check for various naming conventions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'created_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'createdat')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'date_created') THEN
        ALTER TABLE item_moving ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'updated_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'updatedat')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'date_updated') THEN
        ALTER TABLE item_moving ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Ensure item_moving table has a primary key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'item_moving' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        -- Add id column if it does not exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'item_moving' AND column_name = 'id'
        ) THEN
            ALTER TABLE item_moving ADD COLUMN id SERIAL;
        END IF;
        -- Add primary key constraint
        ALTER TABLE item_moving ADD PRIMARY KEY (id);
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_item_moving_email ON item_moving(email);
CREATE INDEX IF NOT EXISTS idx_item_moving_pickuptype ON item_moving(pickuptype);

-- Create index on created_at if the column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_item_moving_created_at ON item_moving(created_at);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'createdat') THEN
        CREATE INDEX IF NOT EXISTS idx_item_moving_createdat ON item_moving(createdat);
    END IF;
END $$;

-- Create or replace the update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'item_moving' THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'updated_at') THEN
            NEW.updated_at = CURRENT_TIMESTAMP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at if the column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_moving' AND column_name = 'updated_at') THEN
        DROP TRIGGER IF EXISTS update_item_moving_updated_at ON item_moving;
        CREATE TRIGGER update_item_moving_updated_at 
            BEFORE UPDATE ON item_moving 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$; 