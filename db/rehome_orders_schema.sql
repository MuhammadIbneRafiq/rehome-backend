-- ReHome Orders Database Schema
-- This schema supports the ReHome checkout process with delivery details and assistance options

-- Create rehome_orders table
CREATE TABLE IF NOT EXISTS rehome_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(255) NOT NULL UNIQUE,
    
    -- Customer contact information
    customer_first_name VARCHAR(255) NOT NULL,
    customer_last_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    
    -- Delivery details
    delivery_address TEXT NOT NULL,
    delivery_floor INTEGER NOT NULL DEFAULT 0,
    elevator_available BOOLEAN NOT NULL DEFAULT false,
    
    -- Order totals
    base_total DECIMAL(10,2) NOT NULL,
    carrying_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    assembly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Order status and metadata
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, confirmed, in_delivery, delivered, cancelled
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, paid, refunded
    delivery_date DATE,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign keys for admin tracking
    confirmed_by VARCHAR(255), -- admin email who confirmed the order
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Create rehome_order_items table for individual items in each order
CREATE TABLE IF NOT EXISTS rehome_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES rehome_orders(id) ON DELETE CASCADE,
    
    -- Item details from marketplace
    marketplace_item_id TEXT NOT NULL, -- Reference to marketplace_furniture
    item_name VARCHAR(255) NOT NULL,
    item_category VARCHAR(100) NOT NULL,
    item_subcategory VARCHAR(100),
    item_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    image_url TEXT[], -- Array of image URLs
    
    -- Assistance options for this item
    needs_carrying BOOLEAN NOT NULL DEFAULT false,
    needs_assembly BOOLEAN NOT NULL DEFAULT false,
    
    -- Item-specific costs
    item_carrying_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    item_assembly_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rehome_orders_order_number ON rehome_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_rehome_orders_customer_email ON rehome_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_rehome_orders_status ON rehome_orders(status);
CREATE INDEX IF NOT EXISTS idx_rehome_orders_created_at ON rehome_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_rehome_order_items_order_id ON rehome_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_rehome_order_items_marketplace_item_id ON rehome_order_items(marketplace_item_id);

-- Auto-update updated_at timestamp function
CREATE OR REPLACE FUNCTION update_rehome_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers for updated_at
CREATE TRIGGER update_rehome_orders_updated_at 
    BEFORE UPDATE ON rehome_orders 
    FOR EACH ROW EXECUTE FUNCTION update_rehome_orders_updated_at();

CREATE TRIGGER update_rehome_order_items_updated_at 
    BEFORE UPDATE ON rehome_order_items 
    FOR EACH ROW EXECUTE FUNCTION update_rehome_orders_updated_at();

-- Create view for order details with items
CREATE OR REPLACE VIEW rehome_order_details AS
SELECT 
    ro.id,
    ro.order_number,
    ro.customer_first_name,
    ro.customer_last_name,
    ro.customer_email,
    ro.customer_phone,
    ro.delivery_address,
    ro.delivery_floor,
    ro.elevator_available,
    ro.base_total,
    ro.carrying_cost,
    ro.assembly_cost,
    ro.total_amount,
    ro.status,
    ro.payment_status,
    ro.delivery_date,
    ro.notes,
    ro.created_at,
    ro.updated_at,
    ro.confirmed_by,
    ro.confirmed_at,
    
    -- Aggregated item information
    COUNT(roi.id) as item_count,
    SUM(roi.quantity) as total_quantity,
    BOOL_OR(roi.needs_carrying) as has_carrying_items,
    BOOL_OR(roi.needs_assembly) as has_assembly_items,
    
    -- Items as JSON array
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', roi.id,
                'marketplace_item_id', roi.marketplace_item_id,
                'name', roi.item_name,
                'category', roi.item_category,
                'subcategory', roi.item_subcategory,
                'price', roi.item_price,
                'quantity', roi.quantity,
                'image_url', roi.image_url,
                'needs_carrying', roi.needs_carrying,
                'needs_assembly', roi.needs_assembly,
                'carrying_cost', roi.item_carrying_cost,
                'assembly_cost', roi.item_assembly_cost
            ) ORDER BY roi.created_at
        ) FILTER (WHERE roi.id IS NOT NULL),
        '[]'::json
    ) as items
FROM rehome_orders ro
LEFT JOIN rehome_order_items roi ON ro.id = roi.order_id
GROUP BY ro.id, ro.order_number, ro.customer_first_name, ro.customer_last_name, 
         ro.customer_email, ro.customer_phone, ro.delivery_address, ro.delivery_floor, 
         ro.elevator_available, ro.base_total, ro.carrying_cost, ro.assembly_cost, 
         ro.total_amount, ro.status, ro.payment_status, ro.delivery_date, ro.notes, 
         ro.created_at, ro.updated_at, ro.confirmed_by, ro.confirmed_at;

-- Create admin user permissions table for ReHome order management
CREATE TABLE IF NOT EXISTS rehome_order_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email VARCHAR(255) NOT NULL,
    permission_level VARCHAR(50) NOT NULL DEFAULT 'view', -- view, manage, admin
    granted_by VARCHAR(255),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_rehome_order_permissions_admin_email ON rehome_order_permissions(admin_email);
CREATE INDEX IF NOT EXISTS idx_rehome_order_permissions_active ON rehome_order_permissions(is_active);

-- Insert default admin permissions (replace with actual admin emails)
INSERT INTO rehome_order_permissions (admin_email, permission_level, granted_by) VALUES
('admin@rehome.com', 'admin', 'system'),
('manager@rehome.com', 'manage', 'system')
ON CONFLICT (admin_email) DO NOTHING; 