// Pricing Multipliers API endpoints
// Handles CRUD operations for pricing multipliers in Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET /api/admin/pricing-multipliers - Get all pricing multipliers
const getPricingMultipliers = async (req, res) => {
  try {
    const { data: multipliers, error } = await supabase
      .from('pricing_multipliers')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      multipliers: multipliers || []
    });
  } catch (error) {
    console.error('Error fetching pricing multipliers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing multipliers'
    });
  }
};

// POST /api/admin/pricing-multipliers - Create new pricing multiplier
const createPricingMultiplier = async (req, res) => {
  try {
    const { name, description, multiplier, category, active = true } = req.body;

    // Validate required fields
    if (!name || !description || multiplier === undefined || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const { data: pricingMultiplier, error } = await supabase
      .from('pricing_multipliers')
      .insert([{
        name,
        description,
        multiplier: parseFloat(multiplier),
        category,
        active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: pricingMultiplier
    });
  } catch (error) {
    console.error('Error creating pricing multiplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create pricing multiplier'
    });
  }
};

// PUT /api/admin/pricing-multipliers/:id - Update pricing multiplier
const updatePricingMultiplier = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove non-updatable fields
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    // Convert multiplier to number if present
    if (updates.multiplier !== undefined) {
      updates.multiplier = parseFloat(updates.multiplier);
    }

    const { data: pricingMultiplier, error } = await supabase
      .from('pricing_multipliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!pricingMultiplier) {
      return res.status(404).json({
        success: false,
        error: 'Pricing multiplier not found'
      });
    }

    res.status(200).json({
      success: true,
      data: pricingMultiplier
    });
  } catch (error) {
    console.error('Error updating pricing multiplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing multiplier'
    });
  }
};

// DELETE /api/admin/pricing-multipliers/:id - Delete pricing multiplier
const deletePricingMultiplier = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('pricing_multipliers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: 'Pricing multiplier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting pricing multiplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete pricing multiplier'
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
        return await getPricingMultipliers(req, res);
      case 'POST':
        return await createPricingMultiplier(req, res);
      case 'PUT':
        // Extract ID from URL for PUT requests
        const id = req.url.split('/').pop();
        req.params = { id };
        return await updatePricingMultiplier(req, res);
      case 'DELETE':
        // Extract ID from URL for DELETE requests
        const deleteId = req.url.split('/').pop();
        req.params = { id: deleteId };
        return await deletePricingMultiplier(req, res);
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