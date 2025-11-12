-- RPC function to get sales history with proper order details and totals
-- This function efficiently fetches sales history with all relevant details for admin dashboard
-- Returns: id, order_id, customer details, item details, pricing breakdown, payment status

CREATE OR REPLACE FUNCTION get_sales_history_with_details(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NULL,
  p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_id TEXT,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  item_name TEXT,
  item_category TEXT,
  item_subcategory TEXT,
  item_price NUMERIC,
  quantity INTEGER,
  total_amount NUMERIC,
  delivery_fee NUMERIC,
  assembly_fee NUMERIC,
  carrying_fee NUMERIC,
  extra_helper_fee NUMERIC,
  subtotal NUMERIC,
  final_total NUMERIC,
  payment_method TEXT,
  payment_status TEXT,
  order_status TEXT,
  dropoff_address TEXT,
  currency TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sh.id,
    sh.order_id,
    sh.customer_email,
    sh.customer_name,
    sh.customer_phone,
    sh.item_name,
    sh.item_category,
    sh.item_subcategory,
    sh.item_price,
    sh.quantity,
    sh.total_amount,
    COALESCE(sh.delivery_fee, 0) as delivery_fee,
    COALESCE(sh.assembly_fee, 0) as assembly_fee,
    COALESCE(sh.carrying_fee, 0) as carrying_fee,
    COALESCE(sh.extra_helper_fee, 0) as extra_helper_fee,
    COALESCE(sh.subtotal, 0) as subtotal,
    sh.final_total,
    sh.payment_method,
    sh.payment_status,
    sh.order_status,
    sh.dropoff_address,
    sh.currency,
    sh.notes,
    sh.created_at
  FROM sales_history sh
  WHERE 
    (p_search IS NULL OR 
      sh.customer_email ILIKE '%' || p_search || '%' OR
      sh.customer_name ILIKE '%' || p_search || '%' OR
      sh.item_name ILIKE '%' || p_search || '%' OR
      sh.order_id ILIKE '%' || p_search || '%')
    AND (p_category IS NULL OR sh.item_category = p_category)
    AND (p_start_date IS NULL OR sh.created_at >= p_start_date)
    AND (p_end_date IS NULL OR sh.created_at <= p_end_date)
  ORDER BY sh.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission to authenticated users (admin middleware will handle authorization)
GRANT EXECUTE ON FUNCTION get_sales_history_with_details TO authenticated;
