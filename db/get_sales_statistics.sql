-- RPC function to get sales statistics for admin dashboard
-- Returns aggregate statistics including total sales, revenue, and category breakdown

CREATE OR REPLACE FUNCTION get_sales_statistics()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_sales', (SELECT COUNT(*) FROM sales_history),
    'total_revenue', (SELECT COALESCE(SUM(final_total), 0) FROM sales_history),
    'completed_orders', (SELECT COUNT(*) FROM sales_history WHERE payment_status = 'completed'),
    'pending_orders', (SELECT COUNT(*) FROM sales_history WHERE payment_status = 'pending'),
    'total_items_sold', (SELECT COALESCE(SUM(quantity), 0) FROM sales_history),
    'average_order_value', (SELECT COALESCE(AVG(final_total), 0) FROM sales_history),
    'category_breakdown', (
      SELECT json_object_agg(item_category, category_data)
      FROM (
        SELECT 
          COALESCE(item_category, 'Uncategorized') as item_category,
          json_build_object(
            'count', COUNT(*),
            'revenue', SUM(final_total)
          ) as category_data
        FROM sales_history
        GROUP BY item_category
      ) categories
    ),
    'recent_sales_count', (
      SELECT COUNT(*) 
      FROM sales_history 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    ),
    'recent_revenue', (
      SELECT COALESCE(SUM(final_total), 0)
      FROM sales_history 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users (admin middleware will handle authorization)
GRANT EXECUTE ON FUNCTION get_sales_statistics TO authenticated;
