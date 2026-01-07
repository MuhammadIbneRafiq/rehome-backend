import express from 'express';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import supabasePricingService from '../services/supabasePricingService.js';
import NodeCache from 'node-cache';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache for marketplace data (5 minutes TTL)
const marketplaceCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Rate limiting for checkout
const checkoutLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many checkout requests, please try again later'
});

// Request queue for concurrent checkout handling
class CheckoutQueue {
  constructor(maxConcurrent = 10) {
    this.queue = [];
    this.processing = 0;
    this.maxConcurrent = maxConcurrent;
  }

  async add(handler) {
    return new Promise((resolve, reject) => {
      this.queue.push({ handler, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const { handler, resolve, reject } = this.queue.shift();

    try {
      const result = await handler();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing--;
      this.process();
    }
  }
}

const checkoutQueue = new CheckoutQueue(10);

/**
 * Get marketplace items with caching and optimization
 */
router.get('/items', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, minPrice, maxPrice, location } = req.query;
    
    // Create cache key from query params
    const cacheKey = `items_${page}_${limit}_${category}_${search}_${minPrice}_${maxPrice}_${location}`;
    const cached = marketplaceCache.get(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Build query
    let query = supabase
      .from('marketplace_furniture')
      .select('*', { count: 'exact' })
      .eq('sold', false)
      .order('created_at', { ascending: false });

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    if (minPrice) {
      query = query.gte('price', minPrice);
    }
    
    if (maxPrice) {
      query = query.lte('price', maxPrice);
    }
    
    if (location) {
      query = query.ilike('city_name', `%${location}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: items, error, count } = await query;

    if (error) throw error;

    const result = {
      items,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };

    // Cache the result
    marketplaceCache.set(cacheKey, result);

    res.json({
      success: true,
      data: result,
      cached: false
    });

  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch items',
      message: error.message
    });
  }
});

/**
 * Calculate checkout pricing for multiple items
 */
router.post('/calculate-checkout', async (req, res) => {
  try {
    const { items, deliveryLocation, hasStudentId, needsAssembly, needsTransport } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items provided'
      });
    }

    let totalPrice = 0;
    let breakdown = {
      itemsCost: 0,
      assemblyFee: 0,
      transportFee: 0,
      studentDiscount: 0,
      total: 0
    };

    // Calculate items cost
    for (const item of items) {
      const { data: dbItem } = await supabase
        .from('marketplace_furniture')
        .select('price, isrehome')
        .eq('id', item.id)
        .single();
      
      if (dbItem) {
        breakdown.itemsCost += dbItem.price * item.quantity;
      }
    }

    // Calculate assembly fee if needed
    if (needsAssembly) {
      const config = await supabase
        .from('assembly_pricing_config')
        .select('*');
      
      // Apply assembly pricing based on items
      breakdown.assemblyFee = 50; // Simplified for now
    }

    // Calculate transport fee if needed
    if (needsTransport && deliveryLocation) {
      // Use pricing service for transport calculation
      const transportPricing = await supabasePricingService.calculateDistanceCost({
        pickupLocation: { city: 'Amsterdam' }, // Default warehouse location
        dropoffLocation: deliveryLocation
      }, await supabasePricingService.getPricingConfig());
      
      breakdown.transportFee = transportPricing.cost;
    }

    // Apply student discount
    if (hasStudentId) {
      const { data: discountConfig } = await supabase
        .from('discounts_fees_config')
        .select('percentage')
        .eq('type', 'student_discount')
        .single();
      
      if (discountConfig) {
        const subtotal = breakdown.itemsCost + breakdown.assemblyFee + breakdown.transportFee;
        breakdown.studentDiscount = subtotal * discountConfig.percentage;
      }
    }

    breakdown.total = breakdown.itemsCost + breakdown.assemblyFee + breakdown.transportFee - breakdown.studentDiscount;

    res.json({
      success: true,
      data: breakdown
    });

  } catch (error) {
    console.error('Error calculating checkout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate checkout',
      message: error.message
    });
  }
});

/**
 * Process marketplace order with queuing
 */
router.post('/checkout', checkoutLimiter, async (req, res) => {
  try {
    // Queue the checkout request
    const result = await checkoutQueue.add(async () => {
      const {
        items,
        customer,
        deliveryLocation,
        paymentMethod,
        hasStudentId,
        studentIdUrl,
        needsAssembly,
        needsTransport,
        specialInstructions
      } = req.body;

      // Validate required fields
      if (!items || items.length === 0) {
        throw new Error('No items in cart');
      }

      if (!customer || !customer.email) {
        throw new Error('Customer information required');
      }

      // Start transaction
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate final pricing
      const pricingResponse = await fetch(`${process.env.API_URL}/api/marketplace/calculate-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          deliveryLocation,
          hasStudentId,
          needsAssembly,
          needsTransport
        })
      });
      
      const pricingData = await pricingResponse.json();
      
      if (!pricingData.success) {
        throw new Error('Failed to calculate pricing');
      }

      // Create order in database
      const { data: order, error: orderError } = await supabase
        .from('marketplace_orders')
        .insert({
          order_number: orderNumber,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          delivery_location: deliveryLocation,
          items: items,
          pricing_breakdown: pricingData.data,
          total_price: pricingData.data.total,
          payment_method: paymentMethod,
          has_student_id: hasStudentId,
          student_id_url: studentIdUrl,
          needs_assembly: needsAssembly,
          needs_transport: needsTransport,
          special_instructions: specialInstructions,
          status: 'pending'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Update item availability
      const itemIds = items.map(item => item.id);
      const { error: updateError } = await supabase
        .from('marketplace_furniture')
        .update({ 
          sold: true,
          sold_date: new Date().toISOString(),
          buyer_email: customer.email
        })
        .in('id', itemIds);

      if (updateError) {
        console.error('Error updating item availability:', updateError);
      }

      // Clear relevant caches
      marketplaceCache.flushAll();

      return {
        orderId: order.id,
        orderNumber: orderNumber,
        total: pricingData.data.total
      };
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error processing checkout:', error);
    res.status(500).json({
      success: false,
      error: 'Checkout failed',
      message: error.message
    });
  }
});

/**
 * Get order details
 */
router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    const { data: order, error } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    queueLength: checkoutQueue.queue.length,
    processing: checkoutQueue.processing,
    cacheStats: {
      keys: marketplaceCache.keys().length,
      hits: marketplaceCache.getStats().hits,
      misses: marketplaceCache.getStats().misses
    }
  });
});

export default router;
