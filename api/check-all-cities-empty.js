import express from 'express';
import { supabaseClient } from '../db/params.js';

const router = express.Router();

/**
 * GET /api/check-all-cities-empty?date=2025-02-11
 * Returns { success, data: { isEmpty } }
 * Checks if any cities are scheduled on the given date.
 * Used by the Supabase Edge Function proxy for caching at the edge.
 */
router.get('/', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date' });
  }

  const { data, error } = await supabaseClient
    .from('city_schedules')
    .select('city')
    .eq('date', date)
    .limit(1);

  if (error) {
    console.error('[check-all-cities-empty] Error:', error);
    return res.json({ success: true, data: { isEmpty: true } });
  }

  res.json({ success: true, data: { isEmpty: !data || data.length === 0 } });
});

export default router;
