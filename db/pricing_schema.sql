-- Pricing Management Database Schema for Supabase
-- Run these SQL commands in the Supabase SQL Editor

-- Create pricing_configs table
CREATE TABLE IF NOT EXISTS pricing_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('multiplier', 'base_price', 'distance_rate', 'addon')),
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT '€',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create city_base_prices table
CREATE TABLE IF NOT EXISTS city_base_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    city TEXT NOT NULL UNIQUE,
    base_price DECIMAL(10,2) NOT NULL,
    distance_rate DECIMAL(10,2) NOT NULL DEFAULT 3.00,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create pricing_multipliers table
CREATE TABLE IF NOT EXISTS pricing_multipliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    multiplier DECIMAL(5,3) NOT NULL,
    category TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pricing_configs_category ON pricing_configs(category);
CREATE INDEX IF NOT EXISTS idx_pricing_configs_type ON pricing_configs(type);
CREATE INDEX IF NOT EXISTS idx_pricing_configs_active ON pricing_configs(active);
CREATE INDEX IF NOT EXISTS idx_city_base_prices_city ON city_base_prices(city);
CREATE INDEX IF NOT EXISTS idx_city_base_prices_active ON city_base_prices(active);
CREATE INDEX IF NOT EXISTS idx_pricing_multipliers_category ON pricing_multipliers(category);
CREATE INDEX IF NOT EXISTS idx_pricing_multipliers_active ON pricing_multipliers(active);

-- Enable Row Level Security (RLS)
ALTER TABLE pricing_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_base_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_multipliers ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access (you'll need to adjust based on your auth setup)
-- These policies allow full access to authenticated admin users
-- Replace with your actual admin role/user identification logic

-- Pricing configs policies
CREATE POLICY "Allow admin full access to pricing_configs" ON pricing_configs
    FOR ALL USING (auth.role() = 'admin' OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow public read access to active pricing_configs" ON pricing_configs
    FOR SELECT USING (active = true);

-- City base prices policies
CREATE POLICY "Allow admin full access to city_base_prices" ON city_base_prices
    FOR ALL USING (auth.role() = 'admin' OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow public read access to active city_base_prices" ON city_base_prices
    FOR SELECT USING (active = true);

-- Pricing multipliers policies
CREATE POLICY "Allow admin full access to pricing_multipliers" ON pricing_multipliers
    FOR ALL USING (auth.role() = 'admin' OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow public read access to active pricing_multipliers" ON pricing_multipliers
    FOR SELECT USING (active = true);

-- Insert default pricing configurations
INSERT INTO pricing_configs (type, category, name, description, value, unit, active) VALUES
    ('base_price', 'house_moving', 'Amsterdam Base', 'Base price for Amsterdam area', 75.00, '€', true),
    ('base_price', 'house_moving', 'Rotterdam Base', 'Base price for Rotterdam area', 70.00, '€', true),
    ('base_price', 'house_moving', 'Utrecht Base', 'Base price for Utrecht area', 65.00, '€', true),
    ('distance_rate', 'house_moving', 'Distance Rate', 'Extra cost per km beyond 8km', 3.00, '€/km', true),
    ('multiplier', 'house_moving', 'Floor Pickup/Dropoff', 'Extra cost per floor', 15.00, '€/floor', true),
    ('multiplier', 'house_moving', 'No Elevator', 'Multiplier when no elevator available', 1.20, 'x', true),
    ('multiplier', 'house_moving', 'Student Discount', 'Discount for students', 0.80, 'x', true),
    ('multiplier', 'house_moving', 'Early Booking Discount', 'Discount for early booking', 0.50, 'x', true),
    ('addon', 'house_moving', 'Disassembly Service', 'Furniture disassembly cost per item', 25.00, '€/item', true),
    ('addon', 'house_moving', 'Extra Helper', 'Additional helper cost', 35.00, '€', true),
    ('base_price', 'item_transport', 'Small Item Base', 'Base price for small items', 25.00, '€', true),
    ('base_price', 'item_transport', 'Medium Item Base', 'Base price for medium items', 45.00, '€', true),
    ('base_price', 'item_transport', 'Large Item Base', 'Base price for large items', 65.00, '€', true)
ON CONFLICT DO NOTHING;

-- Insert default city prices
INSERT INTO city_base_prices (city, base_price, distance_rate, active) VALUES
    ('Amsterdam', 75.00, 3.00, true),
    ('Rotterdam', 70.00, 3.00, true),
    ('Utrecht', 65.00, 3.00, true),
    ('Den Haag', 70.00, 3.00, true),
    ('Eindhoven', 60.00, 3.00, true),
    ('Tilburg', 55.00, 3.00, true),
    ('Groningen', 55.00, 3.00, true),
    ('Almere', 65.00, 3.00, true),
    ('Breda', 55.00, 3.00, true),
    ('Nijmegen', 60.00, 3.00, true),
    ('Haarlem', 70.00, 3.00, true),
    ('Arnhem', 60.00, 3.00, true),
    ('Enschede', 55.00, 3.00, true),
    ('Apeldoorn', 55.00, 3.00, true),
    ('Leiden', 65.00, 3.00, true),
    ('Maastricht', 60.00, 3.00, true),
    ('Dordrecht', 60.00, 3.00, true),
    ('Zoetermeer', 65.00, 3.00, true),
    ('Zwolle', 55.00, 3.00, true),
    ('Amersfoort', 60.00, 3.00, true)
ON CONFLICT (city) DO NOTHING;

-- Insert default pricing multipliers
INSERT INTO pricing_multipliers (name, description, multiplier, category, active) VALUES
    ('No Elevator', 'Multiplier when no elevator available', 1.200, 'elevator', true),
    ('Student Discount', 'Discount for students', 0.800, 'student', true),
    ('Early Booking Discount', 'Discount for early booking (50% off)', 0.500, 'time', true),
    ('Peak Hours Surcharge', 'Extra charge for peak hours', 1.150, 'time', true),
    ('Weekend Surcharge', 'Extra charge for weekend service', 1.200, 'time', true),
    ('Large Item Multiplier', 'Extra charge for oversized items', 1.300, 'size', true),
    ('Fragile Item Care', 'Extra care for fragile items', 1.100, 'special', true),
    ('Same Day Service', 'Rush service multiplier', 1.500, 'time', true)
ON CONFLICT DO NOTHING;

-- Create functions to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_pricing_configs_updated_at BEFORE UPDATE ON pricing_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_city_base_prices_updated_at BEFORE UPDATE ON city_base_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_multipliers_updated_at BEFORE UPDATE ON pricing_multipliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 