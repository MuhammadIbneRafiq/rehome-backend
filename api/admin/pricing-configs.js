// Pricing Configuration API endpoints
// Handles CRUD operations for pricing configurations in Supabase

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// List of admin email addresses
const ADMIN_EMAILS = [
  'muhammadibnerafiq@gmail.com',
  'testnewuser12345@gmail.com',
  'egzmanagement@gmail.com',
  'samuel.stroehle8@gmail.com',
  'info@rehomebv.com'
];

// Helper function to check if user is admin
const isAdmin = (userEmail) => {
  return ADMIN_EMAILS.includes(userEmail);
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ success: false, error: "Authentication token is required" });
        }

        const { data: user, error } = await supabase.auth.getUser(token);

        if (error || !user || !user.user) {
            return res.status(403).json({ success: false, error: "Invalid token or user not found" });
        }

        // ONLY check if email is in admin list - nothing else
        if (!ADMIN_EMAILS.includes(user.user.email)) {
            return res.status(403).json({ success: false, error: `Access denied. Email ${user.user.email} is not in admin list` });
        }

        req.user = user.user;
        next();
    } catch (error) {
        console.error("Admin authentication error:", error);
        return res.status(403).json({ success: false, error: "Authentication failed" });
    }
};

// GET / - Get all pricing configurations
router.get('/', authenticateAdmin, async (req, res) => {
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
});

// POST / - Create new pricing configuration
router.post('/', authenticateAdmin, async (req, res) => {
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
});

// PUT /:id - Update pricing configuration
router.put('/:id', authenticateAdmin, async (req, res) => {
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
});

// DELETE /:id - Delete pricing configuration
router.delete('/:id', authenticateAdmin, async (req, res) => {
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
});

export default router; 