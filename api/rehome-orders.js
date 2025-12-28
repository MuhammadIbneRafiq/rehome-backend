import express from 'express';
import { supabaseClient as supabase } from '../db/params.js';
import { sendReHomeOrderEmail } from '../notif.js';
import jwt from 'jsonwebtoken';
const router = express.Router();

// List of admin email addresses - keep in sync with server.js and frontend admin files
const ADMIN_EMAILS = [
  'muhammadibnerafiq@gmail.com',
  'testnewuser12345@gmail.com',
  'egzmanagement@gmail.com',
  'samuel.stroehle8@gmail.com',
  'info@rehomebv.com'
];

// Middleware to verify admin permissions
const verifyAdminPermissions = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    let userEmail = null;
    let userId = null;

    // 1) Try to verify as custom JWT (same behaviour as authenticateAdmin in server.js)
    try {
      const decoded = jwt.verify(token, jwtSecret);
      userEmail = decoded.email;
      userId = decoded.userId || decoded.sub;

      if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
        req.user = {
          id: userId,
          email: userEmail,
          provider: decoded.provider || 'custom'
        };
        req.adminPermissions = 'admin';
        return next();
      }
    } catch (jwtError) {
      // Fall back to Supabase verification below
      console.log('verifyAdminPermissions: JWT verification failed, falling back to Supabase:', jwtError.message);
    }

    // 2) Fall back to Supabase auth token verification
    const { data: user, error } = await supabase.auth.getUser(token);
    
    if (error || !user || !user.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    userEmail = user.user.email;

    // 3) Check rehome-specific permissions table
    const { data: permissions, error: permError } = await supabase
      .from('rehome_order_permissions')
      .select('permission_level')
      .eq('admin_email', userEmail)
      .eq('is_active', true)
      .single();

    if (permError && permError.code !== 'PGRST116') {
      console.error('Error checking rehome_order_permissions:', permError);
    }

    // Allow access if user is in global ADMIN_EMAILS even without explicit row
    if (!permissions && !ADMIN_EMAILS.includes(userEmail)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user.user;
    req.adminPermissions = permissions?.permission_level || 'admin';
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// POST /api/rehome-orders - Create a new ReHome order
router.post('/', async (req, res) => {
  try {
    const {
      orderNumber,
      items,
      contactInfo,
      deliveryAddress,
      floor,
      elevatorAvailable,
      baseTotal,
      assistanceCosts,
      totalAmount,
      pricingBreakdown
    } = req.body;

    // Validate required fields
    if (!orderNumber || !items || !contactInfo || !deliveryAddress || totalAmount === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: orderNumber, items, contactInfo, deliveryAddress, totalAmount' 
      });
    }

    // Calculate assistance costs from pricing breakdown
    const carryingCost = pricingBreakdown?.carryingCost || 0;
    const assemblyCost = pricingBreakdown?.assemblyCost || 0;

    // Insert order into database
    const { data: order, error: orderError } = await supabase
      .from('rehome_orders')
      .insert([{
        order_number: orderNumber,
        customer_first_name: contactInfo.firstName,
        customer_last_name: contactInfo.lastName,
        customer_email: contactInfo.email,
        customer_phone: contactInfo.phone,
        delivery_address: deliveryAddress,
        delivery_floor: floor || 0,
        elevator_available: elevatorAvailable || false,
        base_total: baseTotal,
        carrying_cost: carryingCost,
        assembly_cost: assemblyCost,
        total_amount: totalAmount,
        status: 'pending',
        payment_status: 'pending'
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // Calculate per-item costs based on item points from database
    const calculateItemCosts = async (item) => {
      let itemCarryingCost = 0;
      let itemAssemblyCost = 0;
      
      try {
        // Fetch item points from marketplace_item_details table
        const { data: itemDetails, error } = await supabase
          .from('marketplace_item_details')
          .select('points')
          .eq('category', item.category)
          .eq('subcategory', item.subcategory)
          .single();
        
        if (error || !itemDetails) {
          console.warn(`No item details found for ${item.category}/${item.subcategory}, using default`);
          return { itemCarryingCost: 0, itemAssemblyCost: 0 };
        }
        
        const itemPoints = itemDetails.points || 1;
        const quantity = item.quantity || 1;
        const multiplier = 1.35;
        
        // Calculate carrying cost if needed
        if (item.assistance?.needsCarrying) {
          const totalFloors = elevatorAvailable ? 1 : Math.max(0, floor || 0);
          if (totalFloors > 0) {
            itemCarryingCost = itemPoints * totalFloors * multiplier * quantity;
          }
        }
        
        // Calculate assembly cost if needed
        if (item.assistance?.needsAssembly) {
          itemAssemblyCost = itemPoints * multiplier * quantity;
        }
        
        return { itemCarryingCost, itemAssemblyCost };
      } catch (err) {
        console.error('Error calculating item costs:', err);
        return { itemCarryingCost: 0, itemAssemblyCost: 0 };
      }
    };
    
    // Insert order items with calculated costs
    const orderItems = await Promise.all(items.map(async (item) => {
      const { itemCarryingCost, itemAssemblyCost } = await calculateItemCosts(item);
      return {
        order_id: order.id,
        marketplace_item_id: item.id,
        item_name: item.name,
        item_category: item.category,
        item_subcategory: item.subcategory,
        item_price: item.price,
        quantity: item.quantity,
        image_url: item.image_url || item.image_urls || [],
        needs_carrying: item.assistance?.needsCarrying || false,
        needs_assembly: item.assistance?.needsAssembly || false,
        item_carrying_cost: parseFloat(itemCarryingCost.toFixed(2)),
        item_assembly_cost: parseFloat(itemAssemblyCost.toFixed(2))
      };
    }));

    const { error: itemsError } = await supabase
      .from('rehome_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Try to clean up the order if items failed
      await supabase.from('rehome_orders').delete().eq('id', order.id);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    // Send confirmation email
    try {
      console.log('📧 Sending ReHome order confirmation email for order:', orderNumber);
      
      await sendReHomeOrderEmail({
        orderNumber: order.order_number,
        customerFirstName: contactInfo.firstName,
        customerLastName: contactInfo.lastName,
        customerEmail: contactInfo.email,
        customerPhone: contactInfo.phone,
        deliveryAddress,
        floor: floor || 0,
        elevatorAvailable: elevatorAvailable || false,
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          category: item.category,
          subcategory: item.subcategory,
          needsAssembly: item.assistance?.needsAssembly || false,
          needsCarrying: item.assistance?.needsCarrying || false
        })),
        itemImages: items.map(item => item.imageUrl || item.image_url || null),
        baseTotal,
        assistanceCosts: carryingCost + assemblyCost,
        carryingCost,
        assemblyCost,
        totalAmount,
        pricingBreakdown
      });
      
      console.log('✅ ReHome order confirmation email sent successfully');
    } catch (emailError) {
      console.error('❌ Error sending ReHome order confirmation email:', emailError);
      // Don't fail the order creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderNumber: order.order_number,
        orderId: order.id,
        totalAmount: order.total_amount
      }
    });

  } catch (error) {
    console.error('Error in POST /api/rehome-orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rehome-orders - Get all orders (admin only)
router.get('/', verifyAdminPermissions, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('rehome_order_details')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Search filter
    if (search) {
      query = query.or(`order_number.ilike.%${search}%,customer_email.ilike.%${search}%,customer_first_name.ilike.%${search}%,customer_last_name.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: orders, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('rehome_orders')
      .select('*', { count: 'exact', head: true });

    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status);
    }

    if (search) {
      countQuery = countQuery.or(`order_number.ilike.%${search}%,customer_email.ilike.%${search}%,customer_first_name.ilike.%${search}%,customer_last_name.ilike.%${search}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Error getting count:', countError);
    }

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Error in GET /api/rehome-orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rehome-orders/:orderNumber - Get specific order
router.get('/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const { data: order, error } = await supabase
      .from('rehome_order_details')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Error in GET /api/rehome-orders/:orderNumber:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rehome-orders/:orderNumber/status - Update order status (admin only)
router.put('/:orderNumber/status', verifyAdminPermissions, async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status, notes, deliveryDate } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'confirmed', 'in_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    // Add confirmation details if confirming
    if (status === 'confirmed') {
      updateData.confirmed_by = req.user.email;
      updateData.confirmed_at = new Date().toISOString();
    }

    // Add optional fields
    if (notes !== undefined) updateData.notes = notes;
    if (deliveryDate) updateData.delivery_date = deliveryDate;

    const { data: order, error } = await supabase
      .from('rehome_orders')
      .update(updateData)
      .eq('order_number', orderNumber)
      .select()
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found or update failed' });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Error in PUT /api/rehome-orders/:orderNumber/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rehome-orders/:orderNumber/payment - Update payment status (admin only)
router.put('/:orderNumber/payment', verifyAdminPermissions, async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({ error: 'Payment status is required' });
    }

    const validPaymentStatuses = ['pending', 'paid', 'refunded'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const { data: order, error } = await supabase
      .from('rehome_orders')
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('order_number', orderNumber)
      .select()
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found or update failed' });
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Error in PUT /api/rehome-orders/:orderNumber/payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/rehome-orders/:orderNumber - Delete order (admin only, careful!)
router.delete('/:orderNumber', verifyAdminPermissions, async (req, res) => {
  try {
    if (req.adminPermissions !== 'admin') {
      return res.status(403).json({ error: 'Admin level access required for deletion' });
    }

    const { orderNumber } = req.params;

    const { data: order, error } = await supabase
      .from('rehome_orders')
      .delete()
      .eq('order_number', orderNumber)
      .select()
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found or deletion failed' });
    }

    res.json({
      success: true,
      message: 'Order deleted successfully',
      data: { orderNumber: order.order_number }
    });

  } catch (error) {
    console.error('Error in DELETE /api/rehome-orders/:orderNumber:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rehome-orders/stats/summary - Get order statistics (admin only)
router.get('/stats/summary', verifyAdminPermissions, async (req, res) => {
  try {
    const { data: stats, error } = await supabase
      .rpc('get_rehome_order_stats');

    if (error) {
      console.error('Error fetching order stats:', error);
      return res.status(500).json({ error: 'Failed to fetch order statistics' });
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error in GET /api/rehome-orders/stats/summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 