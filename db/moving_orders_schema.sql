-- Function to generate unique moving order numbers
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
    
    -- Combine parts
    full_order_number := 'RH-' || timestamp_part || '-' || random_part;
    
    -- Check if this number already exists in either table
    SELECT COUNT(*) INTO exists_count
    FROM (
        SELECT order_number FROM house_moving
        UNION ALL
        SELECT order_number FROM item_moving
    ) AS combined_orders
    WHERE order_number = full_order_number;
    
    -- If exists, recursively try again
    IF exists_count > 0 THEN
        RETURN generate_moving_order_number();
    END IF;
    
    RETURN full_order_number;
END;
$$;

-- Add order_number column to existing tables if not exists
ALTER TABLE house_moving ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
ALTER TABLE item_moving ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_house_moving_order_number ON house_moving(order_number);
CREATE INDEX IF NOT EXISTS idx_item_moving_order_number ON item_moving(order_number);
