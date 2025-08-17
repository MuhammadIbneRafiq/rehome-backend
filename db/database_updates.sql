-- ReHome Marketplace Database Schema Updates
-- Run this in your Supabase SQL Editor

-- 1. Create the marketplace furniture listings table
CREATE TABLE IF NOT EXISTS marketplace_furniture (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    condition_rating INTEGER CHECK (condition_rating >= 1 AND condition_rating <= 5),
    
    -- Dimensions (optional)
    height_cm DECIMAL(8,2), -- Height in centimeters
    width_cm DECIMAL(8,2),  -- Width in centimeters
    depth_cm DECIMAL(8,2),  -- Depth in centimeters
    
    -- Pricing options
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (pricing_type IN ('fixed', 'bidding', 'negotiable')),
    price DECIMAL(10,2), -- For fixed price
    starting_bid DECIMAL(10,2), -- For bidding
    
    -- Flexible date options
    has_flexible_dates BOOLEAN DEFAULT FALSE,
    flexible_date_start DATE, -- Earliest pickup/delivery date
    flexible_date_end DATE,   -- Latest pickup/delivery date
    preferred_date DATE,      -- Seller's preferred date
    
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    city_name VARCHAR(100) NOT NULL,
    postcode VARCHAR(10),
    seller_email VARCHAR(255) NOT NULL,
    sold BOOLEAN DEFAULT FALSE,
    is_rehome BOOLEAN DEFAULT FALSE,
    base_charge DECIMAL(10,2), -- For flexible pricing
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Additional metadata
    views_count INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    -- Location data for better search
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    
    -- Constraints for pricing
    CONSTRAINT check_fixed_price CHECK (
        (pricing_type = 'fixed' AND price IS NOT NULL AND starting_bid IS NULL) OR
        (pricing_type = 'bidding' AND starting_bid IS NOT NULL AND price IS NULL) OR
        (pricing_type = 'negotiable' AND price IS NULL AND starting_bid IS NULL)
    ),
    
    -- Constraints for flexible dates
    CONSTRAINT check_flexible_dates CHECK (
        (has_flexible_dates = FALSE) OR 
        (has_flexible_dates = TRUE AND flexible_date_start IS NOT NULL AND flexible_date_end IS NOT NULL AND flexible_date_start <= flexible_date_end)
    )
);

-- 2. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_category ON marketplace_furniture(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_subcategory ON marketplace_furniture(subcategory);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_city ON marketplace_furniture(city_name);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_seller ON marketplace_furniture(seller_email);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_sold ON marketplace_furniture(sold);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_price ON marketplace_furniture(price);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_starting_bid ON marketplace_furniture(starting_bid);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_pricing_type ON marketplace_furniture(pricing_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_created_at ON marketplace_furniture(created_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_condition ON marketplace_furniture(condition_rating);

-- 3. Create location index for distance-based searches
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_location ON marketplace_furniture USING GIST (ll_to_earth(latitude, longitude));

-- 4. Auto-update updated_at timestamp function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Apply trigger to marketplace furniture table
CREATE TRIGGER update_marketplace_furniture_updated_at 
    BEFORE UPDATE ON marketplace_furniture 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Create categories table for reference (optional but recommended)
CREATE TABLE IF NOT EXISTS furniture_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    subcategories TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Insert the standard categories
INSERT INTO furniture_categories (name, subcategories) VALUES
    ('Bathroom Furniture', '{}'),
    ('Sofa''s and Chairs', ARRAY['Sofa', 'Armchairs', 'Office Chair/ Bureuaustoel', 'Chairs', 'Kussens']),
    ('Kasten', ARRAY['Closet (Kleidingkast)', 'Bookcase (Boekenkast)', 'Drawer/ Dressoir', 'TV Tables']),
    ('Bedroom', '{}'),
    ('Tables', ARRAY['Office Table (Bureau)', 'Dining Table', 'Sidetables', 'Coffee Table']),
    ('Appliances', ARRAY['Washing Machine', 'Fridge', 'Freezer', 'Others']),
    ('Mirrors', '{}'),
    ('Lamps', '{}'),
    ('Carpets', '{}'),
    ('Curtains', '{}'),
    ('Plants', '{}'),
    ('Vazes', '{}'),
    ('Kitchen equipment', '{}'),
    ('Others', '{}')
ON CONFLICT (name) DO NOTHING;

-- 8. Create view for marketplace listings with additional computed fields
CREATE OR REPLACE VIEW marketplace_listings_view AS
SELECT 
    mf.*,
    CASE 
        WHEN mf.created_at >= NOW() - INTERVAL '7 days' THEN true 
        ELSE false 
    END as is_new,
    CASE 
        WHEN mf.created_at >= NOW() - INTERVAL '24 hours' THEN true 
        ELSE false 
    END as is_today,
    fc.subcategories as available_subcategories
FROM marketplace_furniture mf
LEFT JOIN furniture_categories fc ON fc.name = mf.category
WHERE mf.sold = FALSE
ORDER BY mf.created_at DESC;

-- 9. Create function to increment view count
CREATE OR REPLACE FUNCTION increment_furniture_views(furniture_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE marketplace_furniture 
    SET views_count = views_count + 1 
    WHERE id = furniture_id;
END;
$$ LANGUAGE plpgsql;

-- 10. Row Level Security (RLS) policies
ALTER TABLE marketplace_furniture ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see all active listings
CREATE POLICY "Public can view active listings" ON marketplace_furniture
    FOR SELECT USING (sold = FALSE);

-- Policy: Users can only edit their own listings
CREATE POLICY "Users can edit own listings" ON marketplace_furniture
    FOR UPDATE USING (seller_email = auth.jwt() ->> 'email');

-- Policy: Users can only delete their own listings
CREATE POLICY "Users can delete own listings" ON marketplace_furniture
    FOR DELETE USING (seller_email = auth.jwt() ->> 'email');

-- Policy: Authenticated users can create listings
CREATE POLICY "Authenticated users can create listings" ON marketplace_furniture
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 11. Grant permissions
GRANT SELECT ON marketplace_furniture TO anon;
GRANT ALL ON marketplace_furniture TO authenticated;
GRANT SELECT ON marketplace_listings_view TO anon;
GRANT SELECT ON marketplace_listings_view TO authenticated;
GRANT SELECT ON furniture_categories TO anon;
GRANT SELECT ON furniture_categories TO authenticated;

-- 12. Sample data (optional - remove if you don't want sample data)
INSERT INTO marketplace_furniture (
    name, description, category, subcategory, condition_rating, 
    height_cm, width_cm, depth_cm, pricing_type, price, starting_bid,
    image_urls, city_name, seller_email, is_rehome, base_charge
) VALUES 
    ('Modern Cozy Sofa', 'Beautiful 3-seater sofa in excellent condition. Perfect for any living room.', 
     'Sofa''s and Chairs', 'Sofa', 2, 85.0, 200.0, 90.0, 'fixed', 299.00, NULL,
     ARRAY['https://images.unsplash.com/photo-1555041469-a586c61ea9bc'], 
     'Amsterdam', 'demo@rehome.com', true, 249.00),
    ('Wooden Dining Table', 'Solid wood dining table that seats 6 people comfortably.', 
     'Tables', 'Dining Table', 3, 75.0, 180.0, 90.0, 'bidding', NULL, 300.00,
     ARRAY['https://images.unsplash.com/photo-1449247709967-d4461a6a6103'], 
     'Rotterdam', 'demo@rehome.com', true, 380.00),
    ('Queen Size Bed Frame', 'Sturdy wooden bed frame in good condition.', 
     'Bedroom', NULL, 3, 40.0, 160.0, 200.0, 'negotiable', NULL, NULL,
     ARRAY['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85'], 
     'Utrecht', 'user@example.com', false, NULL);

-- 13. Create function to search marketplace by distance
CREATE OR REPLACE FUNCTION search_marketplace_by_distance(
    search_lat DECIMAL,
    search_lng DECIMAL,
    radius_km INTEGER DEFAULT 25,
    category_filter VARCHAR DEFAULT NULL,
    max_price DECIMAL DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    description TEXT,
    category VARCHAR,
    subcategory VARCHAR,
    price DECIMAL,
    image_urls TEXT[],
    city_name VARCHAR,
    distance_km DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mf.id,
        mf.name,
        mf.description,
        mf.category,
        mf.subcategory,
        mf.price,
        mf.image_urls,
        mf.city_name,
        ROUND(
            (6371 * acos(
                cos(radians(search_lat)) * cos(radians(mf.latitude)) *
                cos(radians(mf.longitude) - radians(search_lng)) +
                sin(radians(search_lat)) * sin(radians(mf.latitude))
            ))::DECIMAL, 2
        ) as distance_km,
        mf.created_at
    FROM marketplace_furniture mf
    WHERE 
        mf.sold = FALSE
        AND (category_filter IS NULL OR mf.category = category_filter)
        AND (max_price IS NULL OR mf.price <= max_price)
        AND mf.latitude IS NOT NULL 
        AND mf.longitude IS NOT NULL
        AND (
            6371 * acos(
                cos(radians(search_lat)) * cos(radians(mf.latitude)) *
                cos(radians(mf.longitude) - radians(search_lng)) +
                sin(radians(search_lat)) * sin(radians(mf.latitude))
            )
        ) <= radius_km
    ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column if it doesn't exist
ALTER TABLE marketplace_furniture 
ADD COLUMN IF NOT EXISTS location geography(POINT);

-- Update the location column with existing latitude/longitude data
UPDATE marketplace_furniture 
SET location = ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create spatial index for location-based searches
CREATE INDEX IF NOT EXISTS idx_marketplace_furniture_location 
ON marketplace_furniture USING GIST (location);

-- Add trigger to automatically update location when lat/long changes
CREATE OR REPLACE FUNCTION update_furniture_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude::float8, NEW.latitude::float8), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_furniture_location ON marketplace_furniture;
CREATE TRIGGER trigger_update_furniture_location
    BEFORE INSERT OR UPDATE OF latitude, longitude
    ON marketplace_furniture
    FOR EACH ROW
    EXECUTE FUNCTION update_furniture_location(); 