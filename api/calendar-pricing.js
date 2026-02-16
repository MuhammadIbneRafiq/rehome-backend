import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { findClosestCity } from '../services/pricing/cityUtils.js';
import {
  calculateHouseMovingFixedPrice,
  calculateItemTransportSameDatePrice,
  calculateItemTransportDiffDatesPrice,
  calculateFlexiblePrice,
  calculateRehomePrice
} from '../services/pricing/basePriceCalculator.js';

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── Batch prefetch: loads all schedule + blocked data for a range in 2 queries ──
let _prefetchedSchedule = null; // { scheduleMap, blockedSet, rangeKey, timestamp }

async function prefetchCalendarData(startDate, endDate) {
  const startStr = new Date(startDate).toISOString().split('T')[0];
  const endStr = new Date(endDate).toISOString().split('T')[0];
  const rangeKey = `${startStr}:${endStr}`;

  // Return cached prefetch if still fresh (1 minute)
  if (_prefetchedSchedule && _prefetchedSchedule.rangeKey === rangeKey &&
      Date.now() - _prefetchedSchedule.timestamp < 60 * 1000) {
    return _prefetchedSchedule;
  }

  // Batch query 1: all scheduled cities in range (columns: date, city)
  const { data: scheduleData } = await supabase
    .from('city_schedules')
    .select('date, city')
    .gte('date', startStr)
    .lte('date', endStr);

  // Batch query 2: all blocked dates in range (include cities + is_full_day for per-city checks)
  const { data: blockedData } = await supabase
    .from('blocked_dates')
    .select('date, cities, is_full_day')
    .gte('date', startStr)
    .lte('date', endStr)
    .eq('is_full_day', true);

  // Build lookup maps
  const scheduleMap = new Map(); // date → [city1, city2, ...]
  scheduleData?.forEach(s => {
    if (!scheduleMap.has(s.date)) {
      scheduleMap.set(s.date, []);
    }
    scheduleMap.get(s.date).push(s.city);
  });

  // blockedMap: date → array of { cities: string[] } entries
  // Empty cities array means ALL cities blocked; otherwise only those specific cities
  const blockedMap = new Map();
  blockedData?.forEach(b => {
    if (!blockedMap.has(b.date)) {
      blockedMap.set(b.date, []);
    }
    blockedMap.get(b.date).push({ cities: b.cities || [] });
  });

  _prefetchedSchedule = { scheduleMap, blockedMap, rangeKey, timestamp: Date.now() };
  console.log('[calendar-pricing] Prefetched', scheduleMap.size, 'schedule days,', blockedMap.size, 'blocked days');
  return _prefetchedSchedule;
}

/**
 * Get calendar pricing for a date range based on locations
 * POST /api/calendar-pricing/range
 */
router.post('/range', async (req, res) => {
  try {
    const { 
      pickupLocation, 
      dropoffLocation, 
      startDate, 
      endDate,
      serviceType, // 'item-transport' or 'house-moving'
      dateOption, // 'fixed', 'flexible', 'rehome'
      pickupDate, // For item transport with different dates
      dropoffDate // For item transport with different dates
    } = req.body;

    // Load all city charges (cached) for robust city resolution
    const allCityCharges = await getAllCityCharges();

    // Resolve cities using robust findClosestCity (same logic as sidebar pricing)
    const pickupCityRow = findClosestCity(pickupLocation, allCityCharges);
    const dropoffCityRow = findClosestCity(dropoffLocation, allCityCharges);
    const pickupCity = pickupCityRow?.city_name || 'Amsterdam';
    const dropoffCity = dropoffCityRow?.city_name || 'Amsterdam';
    const isIntercity = pickupCity !== dropoffCity;

    // Generate date range
    const dates = generateDateRange(startDate, endDate);
    
    // Prefetch all calendar data for the range in 2 batch queries
    const prefetched = await prefetchCalendarData(startDate, endDate);

    // Get city base charges directly from resolved rows (no extra DB queries)
    // parseFloat: Supabase numeric columns may return strings
    const pickupCharge = { cheap: parseFloat(pickupCityRow?.city_day) || 0, standard: parseFloat(pickupCityRow?.normal) || 0 };
    const dropoffCharge = { cheap: parseFloat(dropoffCityRow?.city_day) || 0, standard: parseFloat(dropoffCityRow?.normal) || 0 };

    // Calculate pricing for each date (no more per-day DB queries)
    const pricingData = dates.map((date) => {
      return calculateDatePricing({
        date,
        pickupCity,
        dropoffCity,
        isIntercity,
        serviceType,
        dateOption,
        startDate,
        endDate,
        pickupDate,
        dropoffDate,
        prefetched,
        pickupCharge,
        dropoffCharge
      });
    });

    res.json({
      success: true,
      data: {
        dates: pricingData,
        summary: {
          cheapestDate: pricingData.reduce((min, d) => d.price < min.price ? d : min),
          averagePrice: pricingData.reduce((sum, d) => sum + d.price, 0) / pricingData.length,
          pickupCity,
          dropoffCity,
          isIntercity,
          pickupCharge,
          dropoffCharge
        }
      }
    });
  } catch (error) {
    console.error('[calendar-pricing/range] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Calculate pricing for a specific date (synchronous — all data pre-fetched)
 * Delegates ALL pricing math to basePriceCalculator.js (single source of truth).
 */
function calculateDatePricing({
  date,
  pickupCity,
  dropoffCity,
  isIntercity,
  serviceType,
  dateOption,
  startDate,
  endDate,
  pickupDate,
  dropoffDate,
  prefetched,
  pickupCharge,
  dropoffCharge
}) {
  const dateStr = date.toISOString().split('T')[0];
  const calendarStatus = getCalendarStatusFromPrefetch(dateStr, pickupCity, dropoffCity, prefetched);

  const rateParams = {
    isIntercity,
    pickupCheap: pickupCharge.cheap,
    pickupStandard: pickupCharge.standard,
    dropoffCheap: dropoffCharge.cheap,
    dropoffStandard: dropoffCharge.standard
  };

  let result; // { price, type }

  if (dateOption === 'rehome') {
    result = calculateRehomePrice({ pickupCheap: pickupCharge.cheap });
  } else if (dateOption === 'flexible') {
    // For flexible we need to know if cities are available anywhere in the range
    const rangeDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    result = calculateFlexiblePrice({
      ...rateParams,
      rangeDays,
      pickupAvailableInRange: calendarStatus.pickupScheduled,
      dropoffAvailableInRange: calendarStatus.dropoffScheduled,
      bothAvailableSameDate: calendarStatus.pickupScheduled && calendarStatus.dropoffScheduled
    });
  } else {
    // Fixed date
    const isItemTransport = serviceType === 'item-transport';
    const isDiffDates = isItemTransport && pickupDate && dropoffDate && pickupDate !== dropoffDate;
    const isPairedPreview = isItemTransport && ((pickupDate && !dropoffDate) || (!pickupDate && dropoffDate));

    if (isDiffDates || isPairedPreview) {
      // Item transport different-dates (or preview mode where one date selected)
      let pickupDateStatus, dropoffDateStatus;
      let effectivePickupDate = pickupDate;
      let effectiveDropoffDate = dropoffDate;

      if (isDiffDates) {
        const pStr = new Date(pickupDate).toISOString().split('T')[0];
        const dStr = new Date(dropoffDate).toISOString().split('T')[0];
        pickupDateStatus = getCalendarStatusFromPrefetch(pStr, pickupCity, dropoffCity, prefetched);
        dropoffDateStatus = getCalendarStatusFromPrefetch(dStr, pickupCity, dropoffCity, prefetched);
      } else if (pickupDate && !dropoffDate) {
        const pStr = new Date(pickupDate).toISOString().split('T')[0];
        if (dateStr === pStr) {
          // This IS the pickup date itself — show single-date price
          pickupDateStatus = calendarStatus;
          dropoffDateStatus = calendarStatus;
          effectiveDropoffDate = null; // force single-date path
        } else {
          effectiveDropoffDate = dateStr;
          pickupDateStatus = getCalendarStatusFromPrefetch(pStr, pickupCity, dropoffCity, prefetched);
          dropoffDateStatus = calendarStatus;
        }
      } else {
        const dStr = new Date(dropoffDate).toISOString().split('T')[0];
        if (dateStr === dStr) {
          pickupDateStatus = calendarStatus;
          dropoffDateStatus = calendarStatus;
          effectivePickupDate = null;
        } else {
          effectivePickupDate = dateStr;
          pickupDateStatus = calendarStatus;
          dropoffDateStatus = getCalendarStatusFromPrefetch(dStr, pickupCity, dropoffCity, prefetched);
        }
      }

      if (effectivePickupDate && effectiveDropoffDate && effectivePickupDate !== effectiveDropoffDate) {
        result = calculateItemTransportDiffDatesPrice({
          ...rateParams,
          pickupScheduledOnPickupDate: pickupDateStatus.pickupScheduled,
          dropoffScheduledOnDropoffDate: isIntercity ? dropoffDateStatus.dropoffScheduled : dropoffDateStatus.pickupScheduled,
          pickupDateEmpty: pickupDateStatus.isEmpty,
          dropoffDateEmpty: dropoffDateStatus.isEmpty
        });
      } else {
        // Same date or single-date preview for the selected date itself
        if (isItemTransport) {
          result = calculateItemTransportSameDatePrice({
            ...rateParams,
            pickupScheduled: calendarStatus.pickupScheduled,
            dropoffScheduled: calendarStatus.dropoffScheduled,
            isEmpty: calendarStatus.isEmpty,
            isBlocked: calendarStatus.isBlocked
          });
        } else {
          result = calculateHouseMovingFixedPrice({
            ...rateParams,
            pickupScheduled: calendarStatus.pickupScheduled,
            dropoffScheduled: calendarStatus.dropoffScheduled,
            isEmpty: calendarStatus.isEmpty,
            isBlocked: calendarStatus.isBlocked
          });
        }
      }
    } else if (isItemTransport) {
      result = calculateItemTransportSameDatePrice({
        ...rateParams,
        pickupScheduled: calendarStatus.pickupScheduled,
        dropoffScheduled: calendarStatus.dropoffScheduled,
        isEmpty: calendarStatus.isEmpty,
        isBlocked: calendarStatus.isBlocked
      });
    } else {
      result = calculateHouseMovingFixedPrice({
        ...rateParams,
        pickupScheduled: calendarStatus.pickupScheduled,
        dropoffScheduled: calendarStatus.dropoffScheduled,
        isEmpty: calendarStatus.isEmpty,
        isBlocked: calendarStatus.isBlocked
      });
    }
  }

  // Determine color code from calendar status
  // Same City:  green=scheduled, orange=empty, red=not included, grey=blocked
  // Intercity:  green=both included, orange=one included OR empty, red=neither included, grey=blocked
  let colorCode = 'red';
  let priceType = 'standard';
  if (calendarStatus.isBlocked) {
    colorCode = 'grey';
    priceType = 'blocked';
  } else if (!isIntercity) {
    // Same city color rules
    if (calendarStatus.pickupScheduled) {
      colorCode = 'green';
      priceType = 'cheap';
    } else if (calendarStatus.isEmpty) {
      colorCode = 'orange';
      priceType = 'empty';
    } else {
      colorCode = 'red';
      priceType = 'standard';
    }
  } else {
    // Intercity color rules
    if (calendarStatus.pickupScheduled && calendarStatus.dropoffScheduled) {
      colorCode = 'green';
      priceType = 'cheap';
    } else if (calendarStatus.pickupScheduled || calendarStatus.dropoffScheduled || calendarStatus.isEmpty) {
      colorCode = 'orange';
      priceType = 'empty';
    } else {
      colorCode = 'red';
      priceType = 'standard';
    }
  }

  return {
    date: dateStr,
    colorCode,
    price: Math.round(result.price * 100) / 100,
    priceType,
    breakdown: {
      pickupCityScheduled: calendarStatus.pickupScheduled,
      dropoffCityScheduled: calendarStatus.dropoffScheduled,
      isEmpty: calendarStatus.isEmpty,
      isBlocked: calendarStatus.isBlocked,
      baseCharge: result.price,
      multiplier: 1
    }
  };
}

/**
 * Build calendar status from prefetched data (no DB calls)
 */
function getCalendarStatusFromPrefetch(dateStr, pickupCity, dropoffCity, prefetched) {
  const { scheduleMap, blockedMap } = prefetched;
  const assignedCities = scheduleMap.get(dateStr) || [];

  // Check blocked status: a date is blocked if any block entry covers all cities
  // OR covers the pickup or dropoff city specifically
  const blockEntries = blockedMap.get(dateStr) || [];
  const isBlocked = blockEntries.some(entry => {
    if (!entry.cities || entry.cities.length === 0) return true; // all cities blocked
    const lowerCities = entry.cities.map(c => c.toLowerCase());
    return lowerCities.includes(pickupCity.toLowerCase()) || lowerCities.includes(dropoffCity.toLowerCase());
  });

  const isEmpty = assignedCities.length === 0;
  const pickupScheduled = assignedCities.some(c => c.toLowerCase() === pickupCity.toLowerCase());
  const dropoffScheduled = assignedCities.some(c => c.toLowerCase() === dropoffCity.toLowerCase());

  return { isBlocked, isEmpty, pickupScheduled, dropoffScheduled };
}

/**
 * Get ALL city charges (cached for 5 min). Used by findClosestCity.
 */
let _allCityChargesCache = null;
async function getAllCityCharges() {
  if (_allCityChargesCache && Date.now() - _allCityChargesCache.timestamp < 5 * 60 * 1000) {
    return _allCityChargesCache.data;
  }
  const { data } = await supabase
    .from('city_base_charges')
    .select('city_name, city_day, normal, latitude, longitude');
  _allCityChargesCache = { data: data || [], timestamp: Date.now() };
  return _allCityChargesCache.data;
}


/**
 * Generate date range
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Clear cache on calendar updates (called via webhook or realtime)
 */
router.post('/clear-cache', async (req, res) => {
  _prefetchedSchedule = null;
  _allCityChargesCache = null;
  res.json({ success: true, message: 'Cache cleared' });
});

export default router;
