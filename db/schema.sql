-- ReHome Pricing System Database Schema

-- 1. Furniture Items Table
CREATE TABLE furniture_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    points DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_furniture_items_category ON furniture_items(category);
CREATE INDEX idx_furniture_items_name ON furniture_items(name);

-- 2. City Base Charges Table
CREATE TABLE city_base_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL UNIQUE,
    normal DECIMAL(8,2) NOT NULL,
    city_day DECIMAL(8,2) NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7), -- 1=Monday, 7=Sunday
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster city lookups
CREATE INDEX idx_city_base_charges_name ON city_base_charges(city_name);

-- 3. City Day Data Table
CREATE TABLE city_day_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL UNIQUE,
    days TEXT[] NOT NULL, -- Array of day names
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster city lookups
CREATE INDEX idx_city_day_data_name ON city_day_data(city_name);

-- 4. Pricing Configuration Table
CREATE TABLE pricing_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one active config at a time
CREATE UNIQUE INDEX idx_pricing_config_active ON pricing_config(is_active) WHERE is_active = TRUE;

-- 5. Admin Users Table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster email lookups
CREATE INDEX idx_admin_users_email ON admin_users(email);

-- 6. Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Auto-update updated_at timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
CREATE TRIGGER update_furniture_items_updated_at BEFORE UPDATE ON furniture_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_city_base_charges_updated_at BEFORE UPDATE ON city_base_charges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_city_day_data_updated_at BEFORE UPDATE ON city_day_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_config_updated_at BEFORE UPDATE ON pricing_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Special Requests Services Table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    selected_services TEXT[], -- Array of selected services
    message TEXT,
    contact_info JSONB NOT NULL, -- {phone, email, firstName, lastName}
    pickup_location TEXT,
    dropoff_location TEXT,
    pickup_location_coords JSONB, -- {lat, lng}
    dropoff_location_coords JSONB, -- {lat, lng}
    request_type VARCHAR(100), -- storage, junkRemoval, fullInternationalMove
    preferred_date DATE,
    is_date_flexible BOOLEAN DEFAULT false,
    calculated_distance_km DECIMAL(8,2),
    calculated_duration_seconds INTEGER,
    calculated_duration_text VARCHAR(100),
    distance_provider VARCHAR(50),
    photo_urls TEXT[], -- Array of uploaded photo URLs
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for services table
CREATE INDEX idx_services_request_type ON services(request_type);
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_created_at ON services(created_at);
CREATE INDEX idx_services_preferred_date ON services(preferred_date);

-- Apply update trigger to services table
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initial data seeding

-- Insert default pricing configuration
INSERT INTO pricing_config (config, is_active) VALUES ('{
  "baseMultipliers": {
    "houseMovingItemMultiplier": 2.0,
    "itemTransportMultiplier": 1.0,
    "addonMultiplier": 3.0
  },
  "distancePricing": {
    "smallDistance": { "threshold": 10, "rate": 0 },
    "mediumDistance": { "threshold": 50, "rate": 0.7 },
    "longDistance": { "rate": 0.5 }
  },
  "carryingMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 0.015 },
    "highValue": { "multiplier": 0.040 }
  },
  "assemblyMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 1.80 },
    "highValue": { "multiplier": 4.2 }
  },
  "extraHelperPricing": {
    "smallMove": { "threshold": 30, "price": 30 },
    "bigMove": { "price": 60 }
  },
  "cityRange": {
    "baseRadius": 8,
    "extraKmRate": 3
  },
  "studentDiscount": 0.1,
  "weekendMultiplier": 1.2,
  "cityDayMultiplier": 1.3,
  "floorChargePerLevel": 25.0,
  "elevatorDiscount": 0.8,
  "assemblyChargePerItem": 30.0,
  "extraHelperChargePerItem": 20.0,
  "earlyBookingDiscount": 0.1,
  "minimumCharge": 75.0
}', true);

-- Insert sample furniture items
INSERT INTO furniture_items (name, category, points) VALUES
('Single Bed', 'Bedroom', 3.5),
('Double Bed', 'Bedroom', 5.0),
('Queen Bed', 'Bedroom', 6.0),
('King Bed', 'Bedroom', 7.0),
('Mattress (Single)', 'Bedroom', 2.0),
('Mattress (Double)', 'Bedroom', 3.0),
('Mattress (Queen)', 'Bedroom', 3.5),
('Mattress (King)', 'Bedroom', 4.0),
('Wardrobe (Small)', 'Bedroom', 4.0),
('Wardrobe (Large)', 'Bedroom', 6.0),
('Chest of Drawers', 'Bedroom', 3.0),
('Bedside Table', 'Bedroom', 1.5),
('Dining Table (Small)', 'Dining', 3.0),
('Dining Table (Large)', 'Dining', 5.0),
('Dining Chair', 'Dining', 1.0),
('Bar Stool', 'Dining', 1.0),
('Sofa (2-seater)', 'Living Room', 4.0),
('Sofa (3-seater)', 'Living Room', 5.5),
('Armchair', 'Living Room', 2.5),
('Coffee Table', 'Living Room', 2.0),
('TV Stand', 'Living Room', 2.5),
('Bookshelf', 'Living Room', 3.0),
('Refrigerator', 'Kitchen', 5.0),
('Washing Machine', 'Kitchen', 4.5),
('Dishwasher', 'Kitchen', 3.5),
('Microwave', 'Kitchen', 1.5),
('Desk', 'Office', 3.0),
('Office Chair', 'Office', 2.0),
('Filing Cabinet', 'Office', 2.5);

-- Insert sample city base charges with day of week (1=Monday, 2=Tuesday, ..., 7=Sunday)
INSERT INTO city_base_charges (city_name, normal, city_day, day_of_week) VALUES
('Amsterdam', 119.00, 39.00, 1),
('Utrecht', 119.00, 35.00, 1),
('Almere', 129.00, 44.00, 1),
('Haarlem', 119.00, 44.00, 1),
('Zaanstad', 119.00, 39.00, 1),
('Amersfoort', 129.00, 49.00, 1),
('s-Hertogenbosch', 89.00, 39.00, 1),
('Hoofddorp', 119.00, 39.00, 1),
('Rotterdam', 119.00, 35.00, 2),
('The Hague', 119.00, 35.00, 2),
('Breda', 79.00, 35.00, 2),
('Leiden', 129.00, 39.00, 2),
('Dordrecht', 109.00, 35.00, 2),
('Zoetermeer', 119.00, 35.00, 2),
('Delft', 119.00, 35.00, 2),
('Eindhoven', 89.00, 34.00, 3),
('Maastricht', 149.00, 34.00, 3),
('Tilburg', 29.00, 29.00, 4),
('Groningen', 219.00, 69.00, 5),
('Nijmegen', 149.00, 59.00, 6),
('Enschede', 159.00, 69.00, 6),
('Arnhem', 159.00, 59.00, 6),
('Apeldoorn', 159.00, 49.00, 6),
('Deventer', 159.00, 99.00, 6),
('Zwolle', 179.00, 119.00, 7),
('Nijmegen', 105.00, 135.00);

-- Insert sample city day data
INSERT INTO city_day_data (city_name, days) VALUES
('Amsterdam', ARRAY['Saturday', 'Sunday']),
('Rotterdam', ARRAY['Friday', 'Saturday']),
('The Hague', ARRAY['Saturday', 'Sunday']),
('Utrecht', ARRAY['Thursday', 'Friday', 'Saturday']),
('Eindhoven', ARRAY['Saturday']),
('Tilburg', ARRAY['Friday', 'Saturday']),
('Groningen', ARRAY['Saturday', 'Sunday']),
('Almere', ARRAY['Saturday']),
('Breda', ARRAY['Friday', 'Saturday']),
('Nijmegen', ARRAY['Saturday', 'Sunday']);

-- Create initial admin user (password: admin123 - should be changed in production)
INSERT INTO admin_users (email, password_hash, role) VALUES
('admin@rehome.com', '$2b$10$9R8M8iQjR6L4vK5x8v8xCOkS1vQbKkGqJnR8L4vK5x8v8xCOkS1vQb', 'admin'); 