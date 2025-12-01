-- Fix missing columns in item_moving and house_moving tables
-- Run this in Supabase SQL Editor

-- ====================================================
-- FIX ITEM_MOVING TABLE
-- ====================================================

-- Add missing columns to item_moving table
DO $$ 
BEGIN
    -- Add order_number column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN order_number VARCHAR(50);
        RAISE NOTICE 'Added order_number column to item_moving table';
    END IF;

    -- Add photo_urls column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'photo_urls'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN photo_urls TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added photo_urls column to item_moving table';
    END IF;

    -- Add date_option column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'date_option'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN date_option VARCHAR(50);
        RAISE NOTICE 'Added date_option column to item_moving table';
    END IF;

    -- Add preferred_time_span column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'preferred_time_span'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN preferred_time_span VARCHAR(100);
        RAISE NOTICE 'Added preferred_time_span column to item_moving table';
    END IF;

    -- Add extra_instructions column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'extra_instructions'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN extra_instructions TEXT;
        RAISE NOTICE 'Added extra_instructions column to item_moving table';
    END IF;

    -- Add elevator_pickup column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'elevator_pickup'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN elevator_pickup BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added elevator_pickup column to item_moving table';
    END IF;

    -- Add elevator_dropoff column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'elevator_dropoff'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN elevator_dropoff BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added elevator_dropoff column to item_moving table';
    END IF;

    -- Add disassembly column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'disassembly'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN disassembly BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added disassembly column to item_moving table';
    END IF;

    -- Add assembly column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'assembly'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN assembly BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added assembly column to item_moving table';
    END IF;

    -- Add extra_helper column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'extra_helper'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN extra_helper BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added extra_helper column to item_moving table';
    END IF;

    -- Add carrying_service column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'carrying_service'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN carrying_service BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added carrying_service column to item_moving table';
    END IF;

    -- Add is_student column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'is_student'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN is_student BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_student column to item_moving table';
    END IF;

    -- Add student_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'student_id'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN student_id VARCHAR(255);
        RAISE NOTICE 'Added student_id column to item_moving table';
    END IF;

    -- Add store_proof_photo column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'store_proof_photo'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN store_proof_photo VARCHAR(255);
        RAISE NOTICE 'Added store_proof_photo column to item_moving table';
    END IF;

    -- Add disassembly_items column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'disassembly_items'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN disassembly_items JSONB;
        RAISE NOTICE 'Added disassembly_items column to item_moving table';
    END IF;

    -- Add assembly_items column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'assembly_items'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN assembly_items JSONB;
        RAISE NOTICE 'Added assembly_items column to item_moving table';
    END IF;

    -- Add extra_helper_items column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'extra_helper_items'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN extra_helper_items JSONB;
        RAISE NOTICE 'Added extra_helper_items column to item_moving table';
    END IF;

    -- Add carrying_service_items column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'carrying_service_items'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN carrying_service_items JSONB;
        RAISE NOTICE 'Added carrying_service_items column to item_moving table';
    END IF;

    -- Add itemvalue column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'itemvalue'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN itemvalue DECIMAL(10,2);
        RAISE NOTICE 'Added itemvalue column to item_moving table';
    END IF;

    -- Add studentdiscount column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'studentdiscount'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN studentdiscount DECIMAL(10,2);
        RAISE NOTICE 'Added studentdiscount column to item_moving table';
    END IF;

    -- Add status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' AND column_name = 'status'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
        RAISE NOTICE 'Added status column to item_moving table';
    END IF;
END $$;

-- ====================================================
-- FIX HOUSE_MOVING TABLE
-- ====================================================

-- Add missing columns to house_moving table
DO $$ 
BEGIN
    -- Add order_number column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN order_number VARCHAR(50);
        RAISE NOTICE 'Added order_number column to house_moving table';
    END IF;

    -- Add photo_urls column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'photo_urls'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN photo_urls TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added photo_urls column to house_moving table';
    END IF;

    -- Add date_option column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'date_option'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN date_option VARCHAR(50);
        RAISE NOTICE 'Added date_option column to house_moving table';
    END IF;

    -- Add preferred_time_span column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'preferred_time_span'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN preferred_time_span VARCHAR(100);
        RAISE NOTICE 'Added preferred_time_span column to house_moving table';
    END IF;

    -- Add extra_instructions column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'extra_instructions'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN extra_instructions TEXT;
        RAISE NOTICE 'Added extra_instructions column to house_moving table';
    END IF;

    -- Add all other columns similar to item_moving...
    -- (elevator_pickup, elevator_dropoff, disassembly, assembly, etc.)
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'elevator_pickup'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN elevator_pickup BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'elevator_dropoff'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN elevator_dropoff BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'disassembly'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN disassembly BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'assembly'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN assembly BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'extra_helper'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN extra_helper BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'carrying_service'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN carrying_service BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'is_student'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN is_student BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'student_id'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN student_id VARCHAR(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'store_proof_photo'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN store_proof_photo VARCHAR(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'disassembly_items'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN disassembly_items JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'assembly_items'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN assembly_items JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'extra_helper_items'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN extra_helper_items JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'carrying_service_items'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN carrying_service_items JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'status'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
    END IF;

    -- Add pricing columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'baseprice'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN baseprice DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'itempoints'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN itempoints INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'itemvalue'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN itemvalue DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'carryingcost'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN carryingcost DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'disassemblycost'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN disassemblycost DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'distancecost'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN distancecost DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'extrahelpercost'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN extrahelpercost DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'studentdiscount'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN studentdiscount DECIMAL(10,2);
    END IF;

    -- Add location columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'firstlocation'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN firstlocation TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'secondlocation'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN secondlocation TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'firstlocation_coords'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN firstlocation_coords JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'secondlocation_coords'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN secondlocation_coords JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' AND column_name = 'calculated_distance_km'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN calculated_distance_km DECIMAL(10,2);
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_item_moving_order_number ON item_moving(order_number);
CREATE INDEX IF NOT EXISTS idx_item_moving_status ON item_moving(status);
CREATE INDEX IF NOT EXISTS idx_house_moving_order_number ON house_moving(order_number);
CREATE INDEX IF NOT EXISTS idx_house_moving_status ON house_moving(status);

-- Show confirmation
SELECT 'Migration completed successfully!' as result;
SELECT 'Item Moving Columns:' as table_info, COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'item_moving';

SELECT 'House Moving Columns:' as table_info, COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'house_moving';
