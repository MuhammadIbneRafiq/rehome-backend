import express from 'express';
import { getCityScheduleStatusCached } from '../services/cacheService.js';

const router = express.Router();

/**
 * GET /api/city-schedule-status?city=Amsterdam&date=2025-02-11
 * Returns { success, data: { isScheduled, isEmpty, scheduledCities, totalCities } }
 * Used by the Supabase Edge Function proxy for caching at the edge.
 */
router.get('/', async (req, res) => {
  const { city, date } = req.query;

  if (!city || !date) {
    return res.status(400).json({ success: false, error: 'Missing city or date' });
  }

  const data = await getCityScheduleStatusCached(city, date);
  res.json({ success: true, data });
});

export default router;
