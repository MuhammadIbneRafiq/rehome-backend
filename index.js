// ReHome Backend API Server
// Express.js server with Supabase integration for pricing management

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'ReHome Backend API'
  });
});

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'ReHome API v1.0',
    endpoints: {
      pricing: {
        configs: '/api/admin/pricing-configs',
        cities: '/api/admin/city-prices',
        multipliers: '/api/admin/pricing-multipliers'
      }
    }
  });
});

// Import and use pricing management routes
const pricingConfigsHandler = require('./api/admin/pricing-configs');
const cityPricesHandler = require('./api/admin/city-prices');
const pricingMultipliersHandler = require('./api/admin/pricing-multipliers');

// Pricing configuration endpoints
app.all('/api/admin/pricing-configs', pricingConfigsHandler);
app.all('/api/admin/pricing-configs/:id', pricingConfigsHandler);

// City prices endpoints
app.all('/api/admin/city-prices', cityPricesHandler);
app.all('/api/admin/city-prices/:id', cityPricesHandler);

// Pricing multipliers endpoints
app.all('/api/admin/pricing-multipliers', pricingMultipliersHandler);
app.all('/api/admin/pricing-multipliers/:id', pricingMultipliersHandler);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ReHome Backend API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; 