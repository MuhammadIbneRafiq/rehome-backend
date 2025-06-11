// City Pricing API endpoints
// Handles CRUD operations for city base prices in Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET /api/admin/city-prices - Get all city prices
const getCityPrices = async (req, res) => {
  try {
    const { data: cities, error } = await supabase
      .from('city_base_prices')
      .select('*')
      .order('city', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      cities: cities || []
    });
  } catch (error) {
    console.error('Error fetching city prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch city prices'
    });
  }
};

// POST /api/admin/city-prices - Create new city price
const createCityPrice = async (req, res) => {
  try {
    const { city, base_price, distance_rate, active = true } = req.body;

    // Validate required fields
    if (!city || base_price === undefined || distance_rate === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const { data: cityPrice, error } = await supabase
      .from('city_base_prices')
      .insert([{
        city,
        base_price: parseFloat(base_price),
        distance_rate: parseFloat(distance_rate),
        active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: cityPrice
    });
  } catch (error) {
    console.error('Error creating city price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create city price'
    });
  }
};

// PUT /api/admin/city-prices/:id - Update city price
const updateCityPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove non-updatable fields
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    // Convert numeric fields
    if (updates.base_price !== undefined) {
      updates.base_price = parseFloat(updates.base_price);
    }
    if (updates.distance_rate !== undefined) {
      updates.distance_rate = parseFloat(updates.distance_rate);
    }

    const { data: cityPrice, error } = await supabase
      .from('city_base_prices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!cityPrice) {
      return res.status(404).json({
        success: false,
        error: 'City price not found'
      });
    }

    res.status(200).json({
      success: true,
      data: cityPrice
    });
  } catch (error) {
    console.error('Error updating city price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update city price'
    });
  }
};

// DELETE /api/admin/city-prices/:id - Delete city price
const deleteCityPrice = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('city_base_prices')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: 'City price deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting city price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete city price'
    });
  }
};

// Express.js route handler
const handler = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        return await getCityPrices(req, res);
      case 'POST':
        return await createCityPrice(req, res);
      case 'PUT':
        // Extract ID from URL for PUT requests
        const id = req.url.split('/').pop();
        req.params = { id };
        return await updateCityPrice(req, res);
      case 'DELETE':
        // Extract ID from URL for DELETE requests
        const deleteId = req.url.split('/').pop();
        req.params = { id: deleteId };
        return await deleteCityPrice(req, res);
      default:
        res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = handler; 