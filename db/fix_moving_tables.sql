-- Fix Moving Tables: Add missing columns and ensure order number generation works
-- Run this script in Supabase SQL Editor

-- 1. Add itemvalue and studentdiscount columns to item_moving table
ALTER TABLE public.item_moving
  ADD COLUMN IF NOT EXISTS itemvalue numeric(12,2),
  ADD COLUMN IF NOT EXISTS studentdiscount numeric(12,2);

-- 2. Add itemvalue and studentdiscount columns to house_moving table
ALTER TABLE public.house_moving
  ADD COLUMN IF NOT EXISTS itemvalue numeric(12,2),
  ADD COLUMN IF NOT EXISTS studentdiscount numeric(12,2);

-- 3. Create or replace the order number generation function
CREATE OR REPLACE FUNCTION generate_moving_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    timestamp_part TEXT;
    random_part TEXT;
    full_order_number TEXT;
    exists_count INTEGER;
BEGIN
    -- Generate timestamp part (last 6 digits of current timestamp)
    timestamp_part := RIGHT(EXTRACT(EPOCH FROM NOW())::TEXT, 6);
    
    -- Generate random part (3 digits)
    random_part := LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    
    -- Combine parts with format: RH-XXXXXX-XXX
    full_order_number := 'RH-' || timestamp_part || '-' || random_part;
    
    -- Check if this number already exists in either table
    SELECT COUNT(*) INTO exists_count
    FROM (
        SELECT order_number FROM house_moving WHERE order_number IS NOT NULL
        UNION ALL
        SELECT order_number FROM item_moving WHERE order_number IS NOT NULL
    ) AS combined_orders
    WHERE order_number = full_order_number;
    
    -- If exists, recursively try again
    IF exists_count > 0 THEN
        RETURN generate_moving_order_number();
    END IF;
    
    RETURN full_order_number;
END;
$$;

-- 4. Ensure order_number column exists and has proper constraints
ALTER TABLE public.house_moving 
  ADD COLUMN IF NOT EXISTS order_number TEXT;

ALTER TABLE public.item_moving 
  ADD COLUMN IF NOT EXISTS order_number TEXT;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_house_moving_order_number ON public.house_moving(order_number);
CREATE INDEX IF NOT EXISTS idx_item_moving_order_number ON public.item_moving(order_number);

-- 6. Generate order numbers for existing rows that don't have them
UPDATE public.house_moving 
SET order_number = generate_moving_order_number() 
WHERE order_number IS NULL;

UPDATE public.item_moving 
SET order_number = generate_moving_order_number() 
WHERE order_number IS NULL;

-- 7. Add unique constraint after all order numbers are generated
-- First remove any existing constraint
ALTER TABLE public.house_moving DROP CONSTRAINT IF EXISTS house_moving_order_number_key;
ALTER TABLE public.item_moving DROP CONSTRAINT IF EXISTS item_moving_order_number_key;

-- Then add it back
ALTER TABLE public.house_moving ADD CONSTRAINT house_moving_order_number_key UNIQUE (order_number);
ALTER TABLE public.item_moving ADD CONSTRAINT item_moving_order_number_key UNIQUE (order_number);

-- Verification: Check if everything is set up correctly
DO $$
BEGIN
    RAISE NOTICE 'Setup complete! Verifying...';
    RAISE NOTICE 'Columns added: itemvalue, studentdiscount';
    RAISE NOTICE 'Function created: generate_moving_order_number()';
    RAISE NOTICE 'Order numbers generated for existing rows';
END $$;
