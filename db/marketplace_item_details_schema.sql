-- Migration: Create marketplace item details table for managing categories, subcategories, and points
-- Run this SQL script in your Supabase SQL editor

-- ====================================================
-- STEP 1: CREATE MARKETPLACE ITEM DETAILS TABLE
-- ====================================================

CREATE TABLE IF NOT EXISTS marketplace_item_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    points INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combinations of category and subcategory
    UNIQUE(category, subcategory)
);

-- ====================================================
-- STEP 2: INSERT INITIAL MARKETPLACE ITEM DATA
-- ====================================================

-- Insert categories and subcategories with their assigned points
INSERT INTO marketplace_item_details (category, subcategory, points) VALUES
-- Bathroom Furniture
('Bathroom Furniture', NULL, 3),

-- Sofa's and Chairs
('Sofa''s and Chairs', 'Sofa', 8),
('Sofa''s and Chairs', 'Armchairs', 5),
('Sofa''s and Chairs', 'Office Chair/ Bureuaustoel', 3),
('Sofa''s and Chairs', 'Chairs', 2),
('Sofa''s and Chairs', 'Kussens', 1),

-- Storage Furniture
('Storage Furniture', 'Closet (Kleidingkast)', 7),
('Storage Furniture', 'Bookcase (Boekenkast)', 4),
('Storage Furniture', 'Drawer/ Dressoir', 3),
('Storage Furniture', 'TV Tables', 2),

-- Bedroom
('Bedroom', NULL, 6),

-- Tables
('Tables', 'Office Table (Bureau)', 4),
('Tables', 'Dining Table', 6),
('Tables', 'Sidetables', 2),
('Tables', 'Coffee Table', 3),

-- Appliances
('Appliances', 'Washing Machine', 8),
('Appliances', 'Fridge', 9),
('Appliances', 'Freezer', 7),
('Appliances', 'Others', 4),

-- Mirrors
('Mirrors', NULL, 2),

-- Lamps
('Lamps', NULL, 1),

-- Carpets
('Carpets', NULL, 3),

-- Curtains
('Curtains', NULL, 2),

-- Plants
('Plants', NULL, 2),

-- Vases
('Vases', NULL, 1),

-- Kitchen equipment
('Kitchen equipment', NULL, 3),

-- Others
('Others', NULL, 2)
ON CONFLICT (category, subcategory) DO UPDATE SET
    points = EXCLUDED.points,
    updated_at = NOW();

-- ====================================================
-- STEP 3: CREATE INDEXES FOR BETTER PERFORMANCE
-- ====================================================

CREATE INDEX IF NOT EXISTS idx_marketplace_item_details_category ON marketplace_item_details(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_item_details_subcategory ON marketplace_item_details(subcategory);
CREATE INDEX IF NOT EXISTS idx_marketplace_item_details_points ON marketplace_item_details(points);
CREATE INDEX IF NOT EXISTS idx_marketplace_item_details_active ON marketplace_item_details(is_active) WHERE is_active = TRUE;

-- ====================================================
-- STEP 4: CREATE TRIGGER FOR UPDATED_AT
-- ====================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_marketplace_item_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to marketplace_item_details table
CREATE TRIGGER update_marketplace_item_details_updated_at 
    BEFORE UPDATE ON marketplace_item_details 
    FOR EACH ROW 
    EXECUTE FUNCTION update_marketplace_item_details_updated_at();

-- ====================================================
-- STEP 5: CREATE VIEW FOR EASY ACCESS
-- ====================================================

CREATE OR REPLACE VIEW marketplace_item_details_view AS
SELECT 
    id,
    category,
    subcategory,
    points,
    is_active,
    created_at,
    updated_at,
    CASE 
        WHEN subcategory IS NULL THEN category
        ELSE category || ' - ' || subcategory
    END as full_category_name
FROM marketplace_item_details
WHERE is_active = TRUE
ORDER BY category, subcategory;

-- ====================================================
-- MIGRATION COMPLETE
-- ====================================================
-- The marketplace item details table is now created and populated
-- This table will be used to manage categories, subcategories, and points for marketplace items
-- The data can be fetched via API endpoints and used in the admin dashboard 