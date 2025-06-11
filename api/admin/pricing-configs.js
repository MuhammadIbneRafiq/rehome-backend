// Pricing Configuration API endpoints
// Handles CRUD operations for pricing configurations in Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET /api/admin/pricing-configs - Get all pricing configurations
const getPricingConfigs = async (req, res) => {
  try {
    const { data: configs, error } = await supabase
      .from('pricing_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      success: true,
      configs: configs || []
    });
  } catch (error) {
    console.error('Error fetching pricing configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing configurations'
    });
  }
};

// POST /api/admin/pricing-configs - Create new pricing configuration
const createPricingConfig = async (req, res) => {
  try {
    const { type, category, name, description, value, unit, active = true } = req.body;

    // Validate required fields
    if (!type || !category || !name || !description || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const { data: config, error } = await supabase
      .from('pricing_configs')
      .insert([{
        type,
        category,
        name,
        description,
        value: parseFloat(value),
        unit: unit || '€',
        active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error creating pricing config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create pricing configuration'
    });
  }
};

// PUT /api/admin/pricing-configs/:id - Update pricing configuration
const updatePricingConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove non-updatable fields
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    // Convert value to number if present
    if (updates.value !== undefined) {
      updates.value = parseFloat(updates.value);
    }

    const { data: config, error } = await supabase
      .from('pricing_configs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Pricing configuration not found'
      });
    }

    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error updating pricing config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing configuration'
    });
  }
};

// DELETE /api/admin/pricing-configs/:id - Delete pricing configuration
const deletePricingConfig = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('pricing_configs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: 'Pricing configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting pricing config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete pricing configuration'
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
        return await getPricingConfigs(req, res);
      case 'POST':
        return await createPricingConfig(req, res);
      case 'PUT':
        // Extract ID from URL for PUT requests
        const id = req.url.split('/').pop();
        req.params = { id };
        return await updatePricingConfig(req, res);
      case 'DELETE':
        // Extract ID from URL for DELETE requests
        const deleteId = req.url.split('/').pop();
        req.params = { id: deleteId };
        return await deletePricingConfig(req, res);
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