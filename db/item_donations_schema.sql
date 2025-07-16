-- Item Donations Table Schema
-- This table stores item donation requests submitted through the frontend

CREATE TABLE IF NOT EXISTS item_donations (
    id SERIAL PRIMARY KEY,
    
    -- Core donation details
    donation_items JSONB NOT NULL, -- Array of items being donated
    custom_item TEXT, -- Additional custom item description
    
    -- Contact information
    contact_info JSONB NOT NULL, -- { firstName, lastName, email, phone }
    
    -- Location details
    pickup_location TEXT, -- Where items are picked up from
    donation_location TEXT, -- Where items are being donated to
    pickup_location_coords JSONB, -- { lat, lng } coordinates for pickup
    donation_location_coords JSONB, -- { lat, lng } coordinates for donation location
    
    -- Scheduling
    preferred_pickup_date DATE, -- When customer prefers pickup
    is_date_flexible BOOLEAN DEFAULT false, -- Whether date is flexible
    
    -- Donation details
    donation_type VARCHAR(50) DEFAULT 'charity', -- 'charity', 'recycling', 'other'
    special_instructions TEXT, -- Any special handling instructions
    organization_name TEXT, -- Name of receiving organization
    organization_contact JSONB, -- Contact info for receiving organization
    total_estimated_value DECIMAL(10,2), -- Estimated total value of donated items
    item_condition VARCHAR(50), -- 'excellent', 'good', 'fair', 'poor'
    photo_urls JSONB DEFAULT '[]'::jsonb, -- Array of photo URLs
    
    -- Distance calculation (from Google Maps API)
    calculated_distance_km DECIMAL(8,2), -- Distance in kilometers
    calculated_duration_seconds INTEGER, -- Duration in seconds
    calculated_duration_text VARCHAR(100), -- Human readable duration
    distance_provider VARCHAR(50), -- 'google' or 'openroute'
    
    -- Status and timestamps
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_item_donations_status ON item_donations(status);
CREATE INDEX IF NOT EXISTS idx_item_donations_created_at ON item_donations(created_at);
CREATE INDEX IF NOT EXISTS idx_item_donations_email ON item_donations USING GIN ((contact_info->>'email'));
CREATE INDEX IF NOT EXISTS idx_item_donations_pickup_date ON item_donations(preferred_pickup_date);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_item_donations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_item_donations_updated_at
    BEFORE UPDATE ON item_donations
    FOR EACH ROW
    EXECUTE FUNCTION update_item_donations_updated_at();

-- Comments for documentation
COMMENT ON TABLE item_donations IS 'Stores item donation requests from customers';
COMMENT ON COLUMN item_donations.donation_items IS 'JSON array of items being donated with quantities';
COMMENT ON COLUMN item_donations.contact_info IS 'Customer contact information (firstName, lastName, email, phone)';
COMMENT ON COLUMN item_donations.pickup_location_coords IS 'GPS coordinates for pickup location {lat, lng}';
COMMENT ON COLUMN item_donations.donation_location_coords IS 'GPS coordinates for donation destination {lat, lng}';
COMMENT ON COLUMN item_donations.calculated_distance_km IS 'Distance calculated via Google Maps API';
COMMENT ON COLUMN item_donations.distance_provider IS 'Which service provided the distance calculation'; 