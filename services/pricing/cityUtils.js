/**
 * Shared City Utilities
 * 
 * Centralized city normalization and extraction used by:
 * - calendar-pricing.js
 * - supabasePricingService.js
 */

/**
 * Normalize city name to canonical form
 * @param {string} city
 * @returns {string}
 */
export function normalizeCity(city) {
  if (!city) return 'Amsterdam';
  
  const cityMap = {
    'amsterdam': 'Amsterdam',
    'rotterdam': 'Rotterdam',
    'the hague': 'The Hague',
    'den haag': 'The Hague',
    "'s-gravenhage": 'The Hague',
    'utrecht': 'Utrecht',
    'eindhoven': 'Eindhoven'
  };

  const normalized = city.toLowerCase().trim();
  return cityMap[normalized] || city;
}

/**
 * Extract city from a location object (various formats)
 * @param {Object|null} location
 * @returns {string}
 */
export function extractCity(location) {
  if (!location) return 'Amsterdam';

  const city = location.city ||
    location.address?.city ||
    location.components?.city ||
    location.formattedAddress?.split(',')[0] ||
    'Amsterdam';

  return normalizeCity(city);
}
