-- Sales History Table Schema
CREATE TABLE IF NOT EXISTS sales_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    item_name VARCHAR(255) NOT NULL,
    item_category VARCHAR(100),
    item_subcategory VARCHAR(100),
    item_points INTEGER DEFAULT 0,
    item_price DECIMAL(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'completed',
    order_status VARCHAR(50) DEFAULT 'completed',
    pickup_address TEXT,
    dropoff_address TEXT,
    pickup_date DATE,
    pickup_time VARCHAR(50),
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    assembly_fee DECIMAL(10,2) DEFAULT 0,
    carrying_fee DECIMAL(10,2) DEFAULT 0,
    extra_helper_fee DECIMAL(10,2) DEFAULT 0,
    student_discount DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    final_total DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_history_customer_email ON sales_history(customer_email);
CREATE INDEX IF NOT EXISTS idx_sales_history_order_id ON sales_history(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_history_created_at ON sales_history(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_history_item_category ON sales_history(item_category);
CREATE INDEX IF NOT EXISTS idx_sales_history_payment_status ON sales_history(payment_status);

-- Add comments for documentation
COMMENT ON TABLE sales_history IS 'Stores complete sales history for ReHome marketplace items';
COMMENT ON COLUMN sales_history.order_id IS 'Unique order identifier';
COMMENT ON COLUMN sales_history.customer_email IS 'Customer email address';
COMMENT ON COLUMN sales_history.customer_name IS 'Customer full name';
COMMENT ON COLUMN sales_history.customer_phone IS 'Customer phone number';
COMMENT ON COLUMN sales_history.item_name IS 'Name of the purchased item';
COMMENT ON COLUMN sales_history.item_category IS 'Item category (e.g., Furniture, Appliances)';
COMMENT ON COLUMN sales_history.item_subcategory IS 'Item subcategory (e.g., Chairs, Tables)';
COMMENT ON COLUMN sales_history.item_points IS 'Points value of the item';
COMMENT ON COLUMN sales_history.item_price IS 'Price per item';
COMMENT ON COLUMN sales_history.quantity IS 'Quantity purchased';
COMMENT ON COLUMN sales_history.total_amount IS 'Total amount for this item (price * quantity)';
COMMENT ON COLUMN sales_history.payment_method IS 'Payment method used (card, bank transfer, etc.)';
COMMENT ON COLUMN sales_history.payment_status IS 'Payment status (completed, pending, failed)';
COMMENT ON COLUMN sales_history.order_status IS 'Order status (completed, processing, cancelled)';
COMMENT ON COLUMN sales_history.pickup_address IS 'Pickup address for the order';
COMMENT ON COLUMN sales_history.dropoff_address IS 'Delivery address for the order';
COMMENT ON COLUMN sales_history.pickup_date IS 'Scheduled pickup date';
COMMENT ON COLUMN sales_history.pickup_time IS 'Scheduled pickup time';
COMMENT ON COLUMN sales_history.delivery_fee IS 'Delivery service fee';
COMMENT ON COLUMN sales_history.assembly_fee IS 'Assembly service fee';
COMMENT ON COLUMN sales_history.carrying_fee IS 'Carrying service fee';
COMMENT ON COLUMN sales_history.extra_helper_fee IS 'Extra helper service fee';
COMMENT ON COLUMN sales_history.student_discount IS 'Student discount amount';
COMMENT ON COLUMN sales_history.subtotal IS 'Subtotal before taxes and fees';
COMMENT ON COLUMN sales_history.tax_amount IS 'Tax amount';
COMMENT ON COLUMN sales_history.final_total IS 'Final total amount paid';
COMMENT ON COLUMN sales_history.currency IS 'Currency used (default: EUR)';
COMMENT ON COLUMN sales_history.notes IS 'Additional notes about the order';
COMMENT ON COLUMN sales_history.created_at IS 'Timestamp when the sale was recorded';
COMMENT ON COLUMN sales_history.updated_at IS 'Timestamp when the record was last updated';