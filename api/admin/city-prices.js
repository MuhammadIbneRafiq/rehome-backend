// City Pricing API endpoints
// Handles CRUD operations for city base prices in Supabase

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// List of admin email addresses
const ADMIN_EMAILS = [
  'muhammadibnerafiq123@gmail.com',
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

// GET / - Get all city prices
router.get('/', authenticateAdmin, async (req, res) => {
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
});

// POST / - Create new city price
router.post('/', authenticateAdmin, async (req, res) => {
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
});

// PUT /:id - Update city price
router.put('/:id', authenticateAdmin, async (req, res) => {
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
});

// DELETE /:id - Delete city price
router.delete('/:id', authenticateAdmin, async (req, res) => {
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
});

export default router; 