-- Migration to increase VARCHAR limits for marketplace_furniture table
-- This fixes the "value too long for type character varying(100)" error

-- Increase category column limit from 100 to 255 characters
ALTER TABLE marketplace_furniture 
ALTER COLUMN category TYPE VARCHAR(255);

-- Increase subcategory column limit from 100 to 255 characters  
ALTER TABLE marketplace_furniture 
ALTER COLUMN subcategory TYPE VARCHAR(255);

-- Increase city_name column limit from 100 to 255 characters
ALTER TABLE marketplace_furniture 
ALTER COLUMN city_name TYPE VARCHAR(255);

-- Also update the city-related tables for consistency
ALTER TABLE city_base_charges 
ALTER COLUMN city_name TYPE VARCHAR(255);

ALTER TABLE city_day_data 
ALTER COLUMN city_name TYPE VARCHAR(255);

-- Update the indexes to handle the new column sizes
DROP INDEX IF EXISTS idx_marketplace_furniture_category;
DROP INDEX IF EXISTS idx_marketplace_furniture_subcategory;
DROP INDEX IF EXISTS idx_marketplace_furniture_city;
DROP INDEX IF EXISTS idx_city_base_charges_name;
DROP INDEX IF EXISTS idx_city_day_data_name;

-- Recreate indexes with new column sizes
CREATE INDEX idx_marketplace_furniture_category ON marketplace_furniture(category);
CREATE INDEX idx_marketplace_furniture_subcategory ON marketplace_furniture(subcategory);
CREATE INDEX idx_marketplace_furniture_city ON marketplace_furniture(city_name);
CREATE INDEX idx_city_base_charges_name ON city_base_charges(city_name);
CREATE INDEX idx_city_day_data_name ON city_day_data(city_name);

-- Update furniture_categories table as well for consistency
ALTER TABLE furniture_categories 
ALTER COLUMN name TYPE VARCHAR(255);

DROP INDEX IF EXISTS idx_furniture_categories_name;
CREATE UNIQUE INDEX idx_furniture_categories_name ON furniture_categories(name); 