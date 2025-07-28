-- Migration: Add photo_urls column to item_moving and house_moving tables
-- Run this in Supabase SQL Editor

-- Add photo_urls column to item_moving table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_moving' 
        AND column_name = 'photo_urls'
    ) THEN
        ALTER TABLE item_moving ADD COLUMN photo_urls TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added photo_urls column to item_moving table';
    ELSE
        RAISE NOTICE 'Column photo_urls already exists in item_moving table';
    END IF;
END $$;

-- Add photo_urls column to house_moving table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'house_moving' 
        AND column_name = 'photo_urls'
    ) THEN
        ALTER TABLE house_moving ADD COLUMN photo_urls TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added photo_urls column to house_moving table';
    ELSE
        RAISE NOTICE 'Column photo_urls already exists in house_moving table';
    END IF;
END $$;

-- Verify the columns were added
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name IN ('item_moving', 'house_moving') 
AND column_name = 'photo_urls'
ORDER BY table_name; 