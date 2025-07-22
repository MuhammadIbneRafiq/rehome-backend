-- Migration: Add photo_urls column to services table
-- This script can be run safely multiple times

-- Add photo_urls column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'services' 
        AND column_name = 'photo_urls'
    ) THEN
        ALTER TABLE services ADD COLUMN photo_urls TEXT[];
        RAISE NOTICE 'Added photo_urls column to services table';
    ELSE
        RAISE NOTICE 'Column photo_urls already exists in services table';
    END IF;
END $$;

-- Add status column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'services' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE services ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
        RAISE NOTICE 'Added status column to services table';
    ELSE
        RAISE NOTICE 'Column status already exists in services table';
    END IF;
END $$;

-- Create index on status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'services'
        AND indexname = 'idx_services_status'
    ) THEN
        CREATE INDEX idx_services_status ON services(status);
        RAISE NOTICE 'Created index idx_services_status';
    ELSE
        RAISE NOTICE 'Index idx_services_status already exists';
    END IF;
END $$; 