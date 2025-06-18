-- Simple Bidding System - Like Chat Messages
-- No complex approval workflow, bids are immediate and visible

-- Create marketplace_bids table
CREATE TABLE IF NOT EXISTS marketplace_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT NOT NULL, -- Can reference marketplace_furniture(id)
    bidder_email VARCHAR(255) NOT NULL,
    bidder_name VARCHAR(255) NOT NULL,
    bid_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_item_id ON marketplace_bids(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_bidder_email ON marketplace_bids(bidder_email);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_created_at ON marketplace_bids(created_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marketplace_bids_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_marketplace_bids_updated_at 
    BEFORE UPDATE ON marketplace_bids 
    FOR EACH ROW EXECUTE FUNCTION update_marketplace_bids_updated_at(); 