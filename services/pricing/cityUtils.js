/**
 * Shared City Utilities — Single source of truth for city resolution
 * 
 * Used by:
 * - calendar-pricing.js  (calendar sticker prices)
 * - supabasePricingService.js  (sidebar base price)
 */

// Dutch city name variations → canonical name
const CITY_VARIATIONS = {
  'den haag': 'The Hague',
  'the hague': 'The Hague',
  "'s-gravenhage": 'The Hague',
  's-gravenhage': 'The Hague',
  "'s-hertogenbosch": 's-Hertogenbosch',
  'den bosch': 's-Hertogenbosch'
};

/**
 * Normalize city name to canonical form
 * @param {string} city
 * @returns {string}
 */
export function normalizeCity(city) {
  if (!city) return 'Amsterdam';
  const key = city.toLowerCase().trim();
  return CITY_VARIATIONS[key] || city;
}

/**
 * Extract city name from a location object (simple heuristic, no DB lookup).
 * Kept for backward compatibility — prefer findClosestCity() when cityCharges are available.
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

/**
 * Robust city resolution: find the closest matching city from the cityCharges list.
 * Uses a multi-priority approach:
 *   1. Direct match on location.city field
 *   2. Dutch name variations
 *   3. Search for any known city name within formattedAddress / displayName / text
 *   4. Coordinate-based nearest city (Haversine)
 *   5. Fallback to first available city
 *
 * @param {Object|null} location  — Google Place object (city, formattedAddress, displayName, text, coordinates)
 * @param {Array} cityCharges     — rows from city_base_charges (city_name, city_day, normal, latitude, longitude)
 * @returns {Object|null}         — matching cityCharges row, or null
 */
export function findClosestCity(location, cityCharges) {
  if (!location || !cityCharges?.length) return null;

  // --- PRIORITY 1: direct city field ---
  if (location.city) {
    const cityName = location.city.toLowerCase().trim();

    const directMatch = cityCharges.find(c =>
      c.city_name?.toLowerCase() === cityName ||
      cityName.includes(c.city_name?.toLowerCase()) ||
      c.city_name?.toLowerCase().includes(cityName)
    );
    if (directMatch) return directMatch;

    // Check Dutch variations
    const canonical = CITY_VARIATIONS[cityName] || CITY_VARIATIONS[cityName.replace(/'/g, "'")];
    if (canonical) {
      const variantMatch = cityCharges.find(c => c.city_name === canonical);
      if (variantMatch) return variantMatch;
    }
  }

  // --- PRIORITY 2: search within formattedAddress / displayName / text ---
  const searchText = (
    location.formattedAddress?.toLowerCase() ||
    location.displayName?.toLowerCase() ||
    location.text?.toLowerCase() ||
    ''
  );

  if (searchText) {
    const match = cityCharges.find(c =>
      searchText.includes(c.city_name?.toLowerCase())
    );
    if (match) return match;
  }

  // --- PRIORITY 3: coordinate-based nearest city (Haversine) ---
  const coords = location.coordinates || location;
  if (coords?.lat && coords?.lng) {
    let closest = null;
    let minDist = Infinity;
    for (const c of cityCharges) {
      if (c.latitude && c.longitude) {
        const dist = haversineDistance(
          coords.lat, coords.lng,
          parseFloat(c.latitude), parseFloat(c.longitude)
        );
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
    }
    if (closest) return closest;
  }

  // --- PRIORITY 4: fallback to first city ---
  return cityCharges[0] || null;
}

/**
 * Haversine formula — straight-line distance in km between two lat/lng points
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
