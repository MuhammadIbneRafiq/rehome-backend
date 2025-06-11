-- COMPLETE PRICING UPDATE - RUN THIS TO FIX ALL PRICING DATA
-- This will update your database with the exact pricing from the document

-- ====================================================
-- STEP 1: UPDATE CITY BASE CHARGES TABLE STRUCTURE
-- ====================================================

-- Add day_of_week column if it doesn't exist
ALTER TABLE city_base_charges 
ADD COLUMN IF NOT EXISTS day_of_week INTEGER CHECK (day_of_week >= 1 AND day_of_week <= 7);

-- ====================================================
-- STEP 2: UPDATE CITY BASE CHARGES WITH EXACT PRICING
-- ====================================================

-- Clear existing data and insert correct data from the document
DELETE FROM city_base_charges;

-- Insert all cities with exact pricing from the document
INSERT INTO city_base_charges (city_name, normal, city_day, day_of_week) VALUES
-- Day 1 (Monday) cities - Orange group in document
('Amsterdam', 119.00, 39.00, 1),
('Utrecht', 119.00, 35.00, 1),
('Almere', 129.00, 44.00, 1),
('Haarlem', 119.00, 44.00, 1),
('Zaanstad', 119.00, 39.00, 1),
('Amersfoort', 129.00, 49.00, 1),
('s-Hertogenbosch', 89.00, 39.00, 1),
('Hoofddorp', 119.00, 39.00, 1),

-- Day 2 (Tuesday) cities - Blue group in document
('Rotterdam', 119.00, 35.00, 2),
('The Hague', 119.00, 35.00, 2),
('Breda', 79.00, 35.00, 2),
('Leiden', 129.00, 39.00, 2),
('Dordrecht', 109.00, 35.00, 2),
('Zoetermeer', 119.00, 35.00, 2),
('Delft', 119.00, 35.00, 2),

-- Day 3 (Wednesday) cities - Pink group in document
('Eindhoven', 89.00, 34.00, 3),
('Maastricht', 149.00, 34.00, 3),

-- Day 4 (Thursday) cities - Green group in document
('Tilburg', 29.00, 29.00, 4),

-- Day 5 (Friday) cities - Light green group in document
('Groningen', 219.00, 69.00, 5),

-- Day 6 (Saturday) cities - Red group in document
('Nijmegen', 149.00, 59.00, 6),
('Enschede', 159.00, 69.00, 6),
('Arnhem', 159.00, 59.00, 6),
('Apeldoorn', 159.00, 49.00, 6),
('Deventer', 159.00, 99.00, 6),

-- Day 7 (Sunday) cities - Dark red group in document
('Zwolle', 179.00, 119.00, 7);

-- ====================================================
-- STEP 3: UPDATE CITY DAY DATA
-- ====================================================

-- Clear existing city day data
DELETE FROM city_day_data;

-- Insert updated city day data with numeric days (1=Monday, 2=Tuesday, etc.)
INSERT INTO city_day_data (city_name, days) VALUES
('Amsterdam', ARRAY[1]),
('Utrecht', ARRAY[1]),
('Almere', ARRAY[1]),
('Haarlem', ARRAY[1]),
('Zaanstad', ARRAY[1]),
('Amersfoort', ARRAY[1]),
('s-Hertogenbosch', ARRAY[1]),
('Hoofddorp', ARRAY[1]),
('Rotterdam', ARRAY[2]),
('The Hague', ARRAY[2]),
('Breda', ARRAY[2]),
('Leiden', ARRAY[2]),
('Dordrecht', ARRAY[2]),
('Zoetermeer', ARRAY[2]),
('Delft', ARRAY[2]),
('Eindhoven', ARRAY[3]),
('Maastricht', ARRAY[3]),
('Tilburg', ARRAY[4]),
('Groningen', ARRAY[5]),
('Nijmegen', ARRAY[6]),
('Enschede', ARRAY[6]),
('Arnhem', ARRAY[6]),
('Apeldoorn', ARRAY[6]),
('Deventer', ARRAY[6]),
('Zwolle', ARRAY[7]);

-- ====================================================
-- STEP 4: UPDATE FURNITURE ITEMS WITH EXACT POINTS
-- ====================================================

-- Clear existing furniture items
DELETE FROM furniture_items;

-- Insert furniture items with exact points from the document
INSERT INTO furniture_items (name, category, points) VALUES

-- Sofa's and Chairs (Banken en Stoelen)
('2-Seater Sofa', 'Sofa''s and Chairs', 10.0),
('3-Seater Sofa', 'Sofa''s and Chairs', 12.0),
('Armchair', 'Sofa''s and Chairs', 4.0),
('Office Chair', 'Sofa''s and Chairs', 3.0),
('Chair', 'Sofa''s and Chairs', 2.0),

-- Bed (Bed)
('1-Person Bed', 'Bed', 4.0),
('2-Person Bed', 'Bed', 8.0),
('1-Person Mattress', 'Bed', 3.0),
('2-Person Mattress', 'Bed', 6.0),
('Bedside Table', 'Bed', 2.0),

-- Storage (Kasten & Opbergen)
('2-Doors Closet', 'Storage', 8.0),
('3-Doors Closet', 'Storage', 10.0),
('Cloth Rack', 'Storage', 3.0),
('Bookcase', 'Storage', 6.0),
('Drawer/Dressoir', 'Storage', 5.0),
('TV Table', 'Storage', 4.0),

-- Tables (Tafels)
('Office Table', 'Tables', 5.0),
('Dining Table', 'Tables', 6.0),
('Side Table', 'Tables', 2.0),
('Coffee Table', 'Tables', 3.0),

-- Appliances (Apparaten)
('Washing Machine', 'Appliances', 12.0),
('Dryer', 'Appliances', 8.0),
('Big Fridge/Freezer', 'Appliances', 8.0),
('Small Fridge/Freezer', 'Appliances', 4.0),

-- Others (Overige Items)
('Box', 'Others', 0.3),
('Luggage', 'Others', 0.5),
('Bike', 'Others', 6.0),
('Mirror', 'Others', 2.0),
('TV', 'Others', 2.0),
('Computer', 'Others', 2.0),
('Standing Lamp', 'Others', 2.0),
('Small Appliance', 'Others', 1.0),
('Small Household Items', 'Others', 1.0),
('Small Furniture', 'Others', 3.0),
('Big Furniture', 'Others', 8.0);

-- ====================================================
-- STEP 5: VERIFICATION QUERIES
-- ====================================================

-- Show updated city base charges
SELECT 'CITY BASE CHARGES - UPDATED' as status;
SELECT city_name, normal, city_day, day_of_week,
       CASE day_of_week 
           WHEN 1 THEN 'Monday'
           WHEN 2 THEN 'Tuesday' 
           WHEN 3 THEN 'Wednesday'
           WHEN 4 THEN 'Thursday'
           WHEN 5 THEN 'Friday'
           WHEN 6 THEN 'Saturday'
           WHEN 7 THEN 'Sunday'
       END as day_name
FROM city_base_charges 
ORDER BY day_of_week, city_name;

-- Show cities by day of week
SELECT 'CITIES BY DAY OF WEEK' as summary;
SELECT day_of_week,
       CASE day_of_week 
           WHEN 1 THEN 'Monday'
           WHEN 2 THEN 'Tuesday' 
           WHEN 3 THEN 'Wednesday'
           WHEN 4 THEN 'Thursday'
           WHEN 5 THEN 'Friday'
           WHEN 6 THEN 'Saturday'
           WHEN 7 THEN 'Sunday'
       END as day_name,
       COUNT(*) as city_count
FROM city_base_charges 
GROUP BY day_of_week 
ORDER BY day_of_week;

-- Show updated furniture items count
SELECT 'FURNITURE ITEMS - UPDATED' as status;
SELECT category, COUNT(*) as item_count
FROM furniture_items 
GROUP BY category 
ORDER BY category;

SELECT 'UPDATE COMPLETED SUCCESSFULLY!' as final_status; 