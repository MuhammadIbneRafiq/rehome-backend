import express from 'express';
import rateLimit from 'express-rate-limit';
import pricingService from '../services/pricingService.js';
import { getCacheStats, warmUpCache } from '../services/cacheService.js';

const router = express.Router();

// Rate limiting for pricing calculations
const pricingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute per IP
  message: 'Too many pricing requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  // Use a custom key generator to support both IP and user-based limiting
  keyGenerator: (req) => {
    // If user is authenticated, use their ID, otherwise use IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the pricing calculation limit. Please wait a moment before trying again.',
      retryAfter: 60
    });
  }
});

// Lighter rate limit for cache stats
const statsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // 60 requests per minute
  message: 'Too many stats requests'
});

// Request queue to handle concurrent requests
const requestQueue = [];
const MAX_CONCURRENT_CALCULATIONS = 5;
let activeCalculations = 0;

/**
 * Process queued requests
 */
async function processQueue() {
  if (activeCalculations >= MAX_CONCURRENT_CALCULATIONS || requestQueue.length === 0) {
    return;
  }

  const { req, res, resolve } = requestQueue.shift();
  activeCalculations++;

  try {
    const result = await pricingService.calculatePricing(req.body);
    res.json({
      success: true,
      data: result,
      cached: false, // Will be true if result came from cache
      timestamp: new Date().toISOString()
    });
    resolve();
  } catch (error) {
    console.error('Error in pricing calculation:', error);
    res.status(500).json({
      success: false,
      error: 'Pricing calculation failed',
      message: error.message
    });
    resolve();
  } finally {
    activeCalculations--;
    // Process next item in queue
    processQueue();
  }
}

/**
 * Queue a pricing calculation request
 */
function queueRequest(req, res) {
  return new Promise((resolve) => {
    requestQueue.push({ req, res, resolve });
    processQueue();
  });
}

// Calculate pricing endpoint with caching and queueing
router.post('/calculate', pricingLimiter, async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['serviceType', 'pickupLocation', 'dropoffLocation'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }

    // Log request for monitoring
    console.log(`📊 Pricing request from ${req.ip} for ${req.body.serviceType}`);

    // Check if we should queue this request
    if (activeCalculations >= MAX_CONCURRENT_CALCULATIONS) {
      console.log(`⏳ Queueing request (${requestQueue.length} in queue, ${activeCalculations} active)`);
      await queueRequest(req, res);
    } else {
      // Process immediately
      activeCalculations++;
      try {
        const result = await pricingService.calculatePricing(req.body);
        
        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } finally {
        activeCalculations--;
        processQueue(); // Check if there are queued requests
      }
    }
  } catch (error) {
    console.error('Error in pricing endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
});

// Batch pricing calculation endpoint
router.post('/calculate-batch', pricingLimiter, async (req, res) => {
  try {
    const { requests } = req.body;
    
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch request',
        message: 'Requests must be a non-empty array'
      });
    }

    if (requests.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Batch too large',
        message: 'Maximum 10 pricing calculations per batch'
      });
    }

    console.log(`📊 Batch pricing request for ${requests.length} calculations`);

    // Process all requests in parallel
    const results = await Promise.all(
      requests.map(request => 
        pricingService.calculatePricing(request)
          .catch(error => ({ error: error.message }))
      )
    );

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in batch pricing endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Batch calculation failed',
      message: error.message
    });
  }
});

// Get cache statistics
router.get('/cache-stats', statsLimiter, (req, res) => {
  try {
    const stats = getCacheStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        queueLength: requestQueue.length,
        activeCalculations,
        maxConcurrent: MAX_CONCURRENT_CALCULATIONS
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats',
      message: error.message
    });
  }
});

// Warm up cache endpoint (admin only)
router.post('/warm-cache', async (req, res) => {
  try {
    // Check for admin token in header
    const adminToken = req.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Admin access required'
      });
    }

    console.log('🔥 Warming up cache...');
    await warmUpCache();
    
    res.json({
      success: true,
      message: 'Cache warmed up successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to warm cache',
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    queueLength: requestQueue.length,
    activeCalculations,
    timestamp: new Date().toISOString()
  });
});

export default router;
