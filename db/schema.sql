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

-- Initial data seeding

-- Insert default pricing configuration
INSERT INTO pricing_config (config, is_active) VALUES ('{
  "baseMultiplier": 1.0,
  "weekendMultiplier": 1.2,
  "cityDayMultiplier": 1.3,
  "floorChargePerLevel": 25.0,
  "elevatorDiscount": 0.8,
  "assemblyChargePerItem": 30.0,
  "extraHelperChargePerItem": 20.0,
  "studentDiscount": 0.15,
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

-- Insert sample city base charges
INSERT INTO city_base_charges (city_name, normal, city_day) VALUES
('Amsterdam', 120.00, 150.00),
('Rotterdam', 110.00, 140.00),
('The Hague', 115.00, 145.00),
('Utrecht', 110.00, 140.00),
('Eindhoven', 100.00, 130.00),
('Tilburg', 95.00, 125.00),
('Groningen', 100.00, 130.00),
('Almere', 105.00, 135.00),
('Breda', 100.00, 130.00),
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