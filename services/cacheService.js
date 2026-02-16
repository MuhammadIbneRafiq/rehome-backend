import NodeCache from 'node-cache';
import { supabaseClient } from '../db/params.js';

// Create multiple cache instances for different types of data
const cityScheduleCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes TTL for city schedule data
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Don't clone data for performance
  maxKeys: 10000 // Maximum number of keys to prevent memory issues
});

const pricingCache = new NodeCache({ 
  stdTTL: 60, // 1 minute TTL for pricing calculations
  checkperiod: 30,
  useClones: false,
  maxKeys: 5000
});

const furnitureCache = new NodeCache({
  stdTTL: 600, // 10 minutes for furniture data
  checkperiod: 120,
  useClones: false,
  maxKeys: 1000
});

// Constants cache (long-lived)
const constantsCache = new NodeCache({
  stdTTL: 3600, // 1 hour for constants
  checkperiod: 300,
  useClones: false,
  maxKeys: 100
});

// Track cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  cityScheduleHits: 0,
  cityScheduleMisses: 0,
  pricingHits: 0,
  pricingMisses: 0
};

/**
 * Get city schedule status with caching
 * This is the main bottleneck - multiple users checking same dates/cities
 */
export async function getCityScheduleStatusCached(city, date) {
  // Normalize date to YYYY-MM-DD format to avoid timezone issues
  const normalizedDate = date.includes('T') ? new Date(date).toISOString().split('T')[0] : date;
  console.log('[CACHE DEBUG] getCityScheduleStatus:', { city, originalDate: date, normalizedDate });
  const cacheKey = `city_schedule_${city}_${normalizedDate}`;
  
  // Try to get from cache first
  const cached = cityScheduleCache.get(cacheKey);
  if (cached) {
    cacheStats.cityScheduleHits++;
    return cached;
  }
  
  cacheStats.cityScheduleMisses++;
  
  try {
    // Call Supabase RPC function
    const { data, error } = await supabaseClient.rpc('get_city_schedule_status', {
      check_city: city,
      check_date: normalizedDate
    });
    
    if (error) {
      console.error('Error getting city schedule status:', error);
      return { isScheduled: false, isEmpty: true };
    }
    
    console.log('[CACHE DEBUG] City schedule result:', { city, date: normalizedDate, result: data });
    
    // Cache the result
    cityScheduleCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error in getCityScheduleStatusCached:', error);
    return { isScheduled: false, isEmpty: true };
  }
}

/**
 * Check if a date is blocked with caching
 */
export async function isDateBlockedCached(date, cityName = null) {
  const cacheKey = `blocked_date_${date}_${cityName || 'all'}`;
  
  const cached = cityScheduleCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  try {
    const { data, error } = await supabaseClient.rpc('is_date_blocked', {
      check_date: date,
      city_name: cityName
    });
    
    if (error) {
      console.error('Error checking blocked date:', error);
      return false;
    }
    
    // Cache for 5 minutes
    cityScheduleCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error in isDateBlockedCached:', error);
    return false;
  }
}

/**
 * Get all city days in a range with caching
 */
export async function getCityDaysInRangeCached(city, startDate, endDate) {
  const cacheKey = `city_days_range_${city}_${startDate}_${endDate}`;
  
  const cached = cityScheduleCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const { data, error } = await supabaseClient.rpc('get_city_days_in_range', {
      check_city: city,
      start_date: startDate,
      end_date: endDate
    });
    
    if (error) {
      console.error('Error getting city days in range:', error);
      return [];
    }
    
    // Cache for 5 minutes
    cityScheduleCache.set(cacheKey, data || []);
    return data || [];
  } catch (error) {
    console.error('Error in getCityDaysInRangeCached:', error);
    return [];
  }
}

/**
 * Cache pricing calculation results
 */
export function cachePricingResult(input, result) {
  // Create a deterministic key from the input
  const key = createPricingCacheKey(input);
  pricingCache.set(key, result);
  return result;
}

/**
 * Get cached pricing result
 */
export function getCachedPricingResult(input) {
  const key = createPricingCacheKey(input);
  const cached = pricingCache.get(key);
  
  if (cached) {
    cacheStats.pricingHits++;
    return cached;
  }
  
  cacheStats.pricingMisses++;
  return null;
}

/**
 * Create a deterministic cache key for pricing calculations
 */
function createPricingCacheKey(input) {
  // Create a stable key from the most important pricing factors
  const keyParts = [
    'pricing',
    input.serviceType,
    input.pickupLocation,
    input.dropoffLocation,
    input.selectedDate || 'flex',
    input.pickupDate || '',
    input.dropoffDate || '',
    input.isDateFlexible ? 'flex' : 'fixed',
    JSON.stringify(input.itemQuantities || {}),
    input.floorPickup || 0,
    input.floorDropoff || 0,
    input.elevatorPickup ? 'e1' : 'e0',
    input.elevatorDropoff ? 'e1' : 'e0',
    input.isStudent ? 's1' : 's0',
    input.hasStudentId ? 'sid1' : 'sid0',
    input.distanceKm || 'auto'
  ];
  
  return keyParts.join('_');
}

/**
 * Get furniture items with caching
 */
export async function getFurnitureItemsCached() {
  const cacheKey = 'furniture_items_all';
  
  const cached = furnitureCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('furniture_items')
      .select('*');
    
    if (error) {
      console.error('Error fetching furniture items:', error);
      return [];
    }
    
    furnitureCache.set(cacheKey, data || []);
    return data || [];
  } catch (error) {
    console.error('Error in getFurnitureItemsCached:', error);
    return [];
  }
}

/**
 * Get pricing config with caching
 */
export async function getPricingConfigCached() {
  const cacheKey = 'pricing_config';
  
  const cached = constantsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('pricing_config')
      .select('*')
      .single();
    
    if (error) {
      console.error('Error fetching pricing config:', error);
      return null;
    }
    
    constantsCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error in getPricingConfigCached:', error);
    return null;
  }
}

/**
 * Get city base charges with caching
 */
export async function getCityBaseChargesCached() {
  const cacheKey = 'city_base_charges';
  
  const cached = constantsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('city_base_charges')
      .select('*');
    
    if (error) {
      console.error('Error fetching city base charges:', error);
      return {};
    }
    
    // Transform to the expected format
    const charges = {};
    data.forEach(city => {
      charges[city.city_name] = {
        normal: city.normal,
        cityDay: city.city_day
      };
    });
    
    constantsCache.set(cacheKey, charges);
    return charges;
  } catch (error) {
    console.error('Error in getCityBaseChargesCached:', error);
    return {};
  }
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  cityScheduleCache.flushAll();
  pricingCache.flushAll();
  furnitureCache.flushAll();
  constantsCache.flushAll();
  
  console.log('✅ All caches cleared');
}

/**
 * Clear specific cache type
 */
export function clearCache(cacheType) {
  switch (cacheType) {
    case 'citySchedule':
      cityScheduleCache.flushAll();
      break;
    case 'pricing':
      pricingCache.flushAll();
      break;
    case 'furniture':
      furnitureCache.flushAll();
      break;
    case 'constants':
      constantsCache.flushAll();
      break;
    default:
      console.warn(`Unknown cache type: ${cacheType}`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    ...cacheStats,
    cityScheduleKeys: cityScheduleCache.keys().length,
    pricingKeys: pricingCache.keys().length,
    furnitureKeys: furnitureCache.keys().length,
    constantsKeys: constantsCache.keys().length,
    cityScheduleSize: cityScheduleCache.getStats().ksize,
    pricingSize: pricingCache.getStats().ksize
  };
}

/**
 * Warm up cache with common queries
 */
export async function warmUpCache() {
  console.log('🔥 Warming up cache...');
  
  try {
    // Load constants
    await getPricingConfigCached();
    await getCityBaseChargesCached();
    await getFurnitureItemsCached();
    
    // Pre-load common city schedule checks for the next 7 days
    const cities = ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'];
    const today = new Date();
    
    for (const city of cities) {
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        await getCityScheduleStatusCached(city, dateStr);
      }
    }
    
    console.log('✅ Cache warmed up successfully');
  } catch (error) {
    console.error('❌ Error warming up cache:', error);
  }
}

// Auto-clear cache periodically to prevent memory issues
setInterval(() => {
  const stats = getCacheStats();
  
  // Clear if too many keys
  if (stats.cityScheduleKeys > 8000) {
    console.log('⚠️ Clearing city schedule cache due to size');
    clearCache('citySchedule');
  }
  
  if (stats.pricingKeys > 4000) {
    console.log('⚠️ Clearing pricing cache due to size');
    clearCache('pricing');
  }
}, 5 * 60 * 1000); // Check every 5 minutes

export default {
  getCityScheduleStatusCached,
  isDateBlockedCached,
  getCityDaysInRangeCached,
  cachePricingResult,
  getCachedPricingResult,
  getFurnitureItemsCached,
  getPricingConfigCached,
  getCityBaseChargesCached,
  clearAllCaches,
  clearCache,
  getCacheStats,
  warmUpCache
};
