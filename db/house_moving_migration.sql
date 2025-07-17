-- Migration script for house_moving table
-- Run this in Supabase SQL Editor

-- First, let's check and create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS house_moving (
    id SERIAL PRIMARY KEY
);

-- Add columns that might be missing (using IF NOT EXISTS equivalent for PostgreSQL)
DO $$ 
BEGIN
    -- Core contact fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'email') THEN
        ALTER TABLE house_moving ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'firstname') THEN
        ALTER TABLE house_moving ADD COLUMN firstname VARCHAR(100) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'lastname') THEN
        ALTER TABLE house_moving ADD COLUMN lastname VARCHAR(100) NOT NULL DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'phone') THEN
        ALTER TABLE house_moving ADD COLUMN phone VARCHAR(20);
    END IF;

    -- Pickup and service details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'pickuptype') THEN
        ALTER TABLE house_moving ADD COLUMN pickuptype VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'furnitureitems') THEN
        ALTER TABLE house_moving ADD COLUMN furnitureitems JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'customitem') THEN
        ALTER TABLE house_moving ADD COLUMN customitem TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'floorpickup') THEN
        ALTER TABLE house_moving ADD COLUMN floorpickup INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'floordropoff') THEN
        ALTER TABLE house_moving ADD COLUMN floordropoff INTEGER DEFAULT 0;
    END IF;

    -- Pricing fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'estimatedprice') THEN
        ALTER TABLE house_moving ADD COLUMN estimatedprice DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'baseprice') THEN
        ALTER TABLE house_moving ADD COLUMN baseprice DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'itempoints') THEN
        ALTER TABLE house_moving ADD COLUMN itempoints INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'carryingcost') THEN
        ALTER TABLE house_moving ADD COLUMN carryingcost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'disassemblycost') THEN
        ALTER TABLE house_moving ADD COLUMN disassemblycost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'distancecost') THEN
        ALTER TABLE house_moving ADD COLUMN distancecost DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'extrahelpercost') THEN
        ALTER TABLE house_moving ADD COLUMN extrahelpercost DECIMAL(10,2);
    END IF;

    -- Date and scheduling
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'selecteddate') THEN
        ALTER TABLE house_moving ADD COLUMN selecteddate DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'selecteddate_start') THEN
        ALTER TABLE house_moving ADD COLUMN selecteddate_start DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'selecteddate_end') THEN
        ALTER TABLE house_moving ADD COLUMN selecteddate_end DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'isdateflexible') THEN
        ALTER TABLE house_moving ADD COLUMN isdateflexible BOOLEAN DEFAULT FALSE;
    END IF;

    -- Location fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'firstlocation') THEN
        ALTER TABLE house_moving ADD COLUMN firstlocation TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'secondlocation') THEN
        ALTER TABLE house_moving ADD COLUMN secondlocation TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'firstlocation_coords') THEN
        ALTER TABLE house_moving ADD COLUMN firstlocation_coords JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'secondlocation_coords') THEN
        ALTER TABLE house_moving ADD COLUMN secondlocation_coords JSONB;
    END IF;

    -- Distance calculation results
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'calculated_distance_km') THEN
        ALTER TABLE house_moving ADD COLUMN calculated_distance_km DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'calculated_duration_seconds') THEN
        ALTER TABLE house_moving ADD COLUMN calculated_duration_seconds INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'calculated_duration_text') THEN
        ALTER TABLE house_moving ADD COLUMN calculated_duration_text VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'distance_provider') THEN
        ALTER TABLE house_moving ADD COLUMN distance_provider VARCHAR(50);
    END IF;

    -- House moving specific fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'disassembly') THEN
        ALTER TABLE house_moving ADD COLUMN disassembly BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'elevatorpickup') THEN
        ALTER TABLE house_moving ADD COLUMN elevatorpickup BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'elevatordropoff') THEN
        ALTER TABLE house_moving ADD COLUMN elevatordropoff BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'extrahelper') THEN
        ALTER TABLE house_moving ADD COLUMN extrahelper BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'carryingservice') THEN
        ALTER TABLE house_moving ADD COLUMN carryingservice BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'isstudent') THEN
        ALTER TABLE house_moving ADD COLUMN isstudent BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'studentid') THEN
        ALTER TABLE house_moving ADD COLUMN studentid VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'preferredtimespan') THEN
        ALTER TABLE house_moving ADD COLUMN preferredtimespan VARCHAR(50);
    END IF;

    -- Timestamp fields - check for various naming conventions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'created_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'createdat')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'date_created') THEN
        ALTER TABLE house_moving ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'updated_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'updatedat')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'date_updated') THEN
        ALTER TABLE house_moving ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_house_moving_email ON house_moving(email);
CREATE INDEX IF NOT EXISTS idx_house_moving_pickuptype ON house_moving(pickuptype);

-- Create index on created_at if the column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'created_at') THEN
        CREATE INDEX IF NOT EXISTS idx_house_moving_created_at ON house_moving(created_at);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'createdat') THEN
        CREATE INDEX IF NOT EXISTS idx_house_moving_createdat ON house_moving(createdat);
    END IF;
END $$;

-- Create or replace the update trigger function (reuse from item_moving)
-- The function already exists from item_moving migration, so just create the trigger

-- Create trigger for updated_at if the column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'house_moving' AND column_name = 'updated_at') THEN
        DROP TRIGGER IF EXISTS update_house_moving_updated_at ON house_moving;
        CREATE TRIGGER update_house_moving_updated_at 
            BEFORE UPDATE ON house_moving 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$; 