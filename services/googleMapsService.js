import NodeCache from 'node-cache';
import axios from 'axios';

// ==================== CACHE CONFIGURATION ====================

// Cache for Places autocomplete (5 min TTL - same queries are common)
const placesAutocompleteCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60,
  useClones: false,
  maxKeys: 5000
});

// Cache for Place details (30 min TTL - place info rarely changes)
const placeDetailsCache = new NodeCache({
  stdTTL: 1800, // 30 minutes
  checkperiod: 300,
  useClones: false,
  maxKeys: 2000
});

// Cache for distance calculations (1 hour TTL - routes rarely change)
const distanceCache = new NodeCache({
  stdTTL: 3600, // 1 hour
  checkperiod: 300,
  useClones: false,
  maxKeys: 10000
});

// Track cache statistics
const cacheStats = {
  autocompleteHits: 0,
  autocompleteMisses: 0,
  detailsHits: 0,
  detailsMisses: 0,
  distanceHits: 0,
  distanceMisses: 0
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get the Google Maps API key from environment variables
 */
const getApiKey = () => {
  return process.env.GOOGLE_MAPS_API;
};

/**
 * Create a cache key for autocomplete queries
 */
const createAutocompleteCacheKey = (query, options = {}) => {
  const normalizedQuery = query.toLowerCase().trim();
  const locationBias = options.locationBias || 'nl';
  return `autocomplete_${normalizedQuery}_${locationBias}`;
};

/**
 * Create a cache key for place details
 */
const createPlaceDetailsCacheKey = (placeId) => {
  return `place_${placeId}`;
};

/**
 * Create a cache key for distance calculations
 */
const createDistanceCacheKey = (origin, destination) => {
  return `distance_${origin}_${destination}`;
};

// ==================== PLACES AUTOCOMPLETE ====================

/**
 * Search for places using Google Places API (New) with caching
 * @param {string} query - The search query
 * @param {object} options - Optional parameters (locationBias, types, etc.)
 * @returns {Promise<object>} - Autocomplete suggestions
 */
export async function searchPlacesAutocomplete(query, options = {}) {
  if (!query || query.length < 2) {
    return { success: true, suggestions: [] };
  }

  const cacheKey = createAutocompleteCacheKey(query, options);
  
  // Check cache first
  const cached = placesAutocompleteCache.get(cacheKey);
  if (cached) {
    cacheStats.autocompleteHits++;
    console.log(`📦 Cache HIT for autocomplete: "${query}"`);
    return { success: true, suggestions: cached, fromCache: true };
  }
  
  cacheStats.autocompleteMisses++;
  
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ Google Maps API key not found');
    return { success: false, error: 'Google Maps API key not configured' };
  }

  try {
    console.log(`🔍 Fetching autocomplete for: "${query}"`);
    
    const requestBody = {
      input: query,
      languageCode: options.languageCode || 'en',
      includedPrimaryTypes: options.types || ['street_address', 'route', 'locality', 'postal_code']
    };
    
    // Only add region codes if explicitly provided
    if (options.regionCodes && options.regionCodes.length > 0) {
      requestBody.includedRegionCodes = options.regionCodes;
    }
    
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey
        },
        timeout: 5000
      }
    );

    const suggestions = (response.data.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => ({
        placeId: s.placePrediction.placeId,
        text: s.placePrediction.text?.text || '',
        mainText: s.placePrediction.structuredFormat?.mainText?.text || '',
        secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || ''
      }));

    // Cache the results
    placesAutocompleteCache.set(cacheKey, suggestions);
    
    console.log(`✅ Found ${suggestions.length} suggestions for "${query}"`);
    return { success: true, suggestions };
    
  } catch (error) {
    console.error('❌ Places autocomplete error:', error.message);
    return { 
      success: false, 
      error: 'Failed to fetch autocomplete suggestions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

// ==================== PLACE DETAILS ====================

/**
 * Get place details using Google Places API (New) with caching
 * @param {string} placeId - The Google Place ID
 * @returns {Promise<object>} - Place details
 */
export async function getPlaceDetails(placeId) {
  if (!placeId) {
    return { success: false, error: 'Place ID is required' };
  }

  const cacheKey = createPlaceDetailsCacheKey(placeId);
  
  // Check cache first
  const cached = placeDetailsCache.get(cacheKey);
  if (cached) {
    cacheStats.detailsHits++;
    console.log(`📦 Cache HIT for place details: ${placeId}`);
    return { success: true, place: cached, fromCache: true };
  }
  
  cacheStats.detailsMisses++;
  
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ Google Maps API key not found');
    return { success: false, error: 'Google Maps API key not configured' };
  }

  try {
    console.log(`🔍 Fetching place details for: ${placeId}`);
    
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents'
        },
        timeout: 5000
      }
    );

    const data = response.data;
    
    // Extract country and city from address components
    let countryCode = null;
    let countryName = null;
    let city = null;
    
    if (data.addressComponents) {
      for (const component of data.addressComponents) {
        if (component.types?.includes('country')) {
          countryCode = component.shortText;
          countryName = component.longText;
        }
        if (component.types?.includes('locality')) {
          city = component.longText;
        }
      }
    }

    const place = {
      placeId: data.id || placeId,
      displayName: data.displayName?.text || '',
      formattedAddress: data.formattedAddress || '',
      coordinates: data.location ? {
        lat: data.location.latitude,
        lng: data.location.longitude
      } : null,
      countryCode,
      countryName,
      city
    };

    // Cache the results
    placeDetailsCache.set(cacheKey, place);
    
    console.log(`✅ Got place details for: ${place.displayName}`);
    return { success: true, place };
    
  } catch (error) {
    console.error('❌ Place details error:', error.message);
    return { 
      success: false, 
      error: 'Failed to fetch place details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

// ==================== DISTANCE CALCULATION ====================

/**
 * Calculate distance between two locations with caching
 * Uses Google Distance Matrix API with OpenRouteService fallback
 * @param {string} origin - Origin coordinates as "lat,lng"
 * @param {string} destination - Destination coordinates as "lat,lng"
 * @returns {Promise<object>} - Distance calculation result
 */
export async function calculateDistance(origin, destination) {
  if (!origin || !destination) {
    return { success: false, error: 'Origin and destination are required' };
  }

  const cacheKey = createDistanceCacheKey(origin, destination);
  
  // Check cache first
  const cached = distanceCache.get(cacheKey);
  if (cached) {
    cacheStats.distanceHits++;
    console.log(`📦 Cache HIT for distance: ${origin} → ${destination}`);
    return { ...cached, fromCache: true };
  }
  
  cacheStats.distanceMisses++;
  
  console.log('🛣️ Calculating road distance from:', origin, 'to:', destination);

  // Parse coordinates
  const [originLat, originLng] = origin.split(',').map(parseFloat);
  const [destLat, destLng] = destination.split(',').map(parseFloat);

  // Validate coordinates
  if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
    return { success: false, error: 'Invalid coordinates format' };
  }

  // Try Google Distance Matrix API first
  const apiKey = getApiKey();
  
  if (apiKey) {
    try {
      console.log('🔵 Trying Google Distance Matrix API...');
      
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        {
          params: {
            origins: `${originLat},${originLng}`,
            destinations: `${destLat},${destLng}`,
            mode: 'driving',
            units: 'metric',
            key: apiKey
          },
          timeout: 10000
        }
      );

      if (response.data.status === 'OK' && 
          response.data.rows && 
          response.data.rows.length > 0 &&
          response.data.rows[0].elements &&
          response.data.rows[0].elements.length > 0) {
        
        const element = response.data.rows[0].elements[0];
        
        if (element.status === 'OK') {
          const distanceMeters = element.distance.value;
          const distanceKm = distanceMeters / 1000;
          const durationSeconds = element.duration.value;

          // Format duration
          const hours = Math.floor(durationSeconds / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          let durationText = hours > 0 
            ? `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`
            : `${minutes} min${minutes !== 1 ? 's' : ''}`;

          const result = {
            success: true,
            distance: distanceMeters,
            distanceKm: Math.round(distanceKm * 100) / 100,
            duration: durationSeconds,
            durationText,
            distanceText: `${distanceKm.toFixed(1)} km`,
            origin,
            destination,
            provider: 'Google Distance Matrix API'
          };

          // Cache the result
          distanceCache.set(cacheKey, result);
          
          console.log(`✅ Google Distance Matrix API success: ${distanceKm.toFixed(2)} km`);
          return result;
        }
      }
      
      throw new Error('Invalid response from Distance Matrix API');
    } catch (googleError) {
      console.log('⚠️ Google Distance Matrix API failed:', googleError.message);
      console.log('🔄 Falling back to OpenRouteService...');
    }
  } else {
    console.log('⚠️ No GOOGLE_MAPS_API found, using OpenRouteService...');
  }

  // Fallback to OpenRouteService
  const openRouteApiKey = process.env.OPENROUTE_API_KEY;
  
  if (openRouteApiKey) {
    try {
      console.log('🟡 Trying OpenRouteService with API key...');
      
      const openRouteUrl = 'https://api.openrouteservice.org/v2/directions/driving-car';
      const params = {
        start: `${originLng},${originLat}`,
        end: `${destLng},${destLat}`
      };

      const response = await axios.get(openRouteUrl, {
        params,
        timeout: 10000,
        headers: { 
          'Accept': 'application/json',
          'Authorization': openRouteApiKey
        }
      });

      if (response.data.features && response.data.features.length > 0) {
        const route = response.data.features[0];
        const distanceMeters = route.properties.segments[0].distance;
        const durationSeconds = route.properties.segments[0].duration;
        const distanceKm = distanceMeters / 1000;

        // Format duration
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        let durationText = hours > 0 
          ? `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`
          : `${minutes} min${minutes !== 1 ? 's' : ''}`;

        const result = {
          success: true,
          distance: distanceMeters,
          distanceKm: Math.round(distanceKm * 100) / 100,
          duration: durationSeconds,
          durationText,
          distanceText: `${distanceKm.toFixed(1)} km`,
          origin,
          destination,
          provider: 'OpenRouteService'
        };

        // Cache the result
        distanceCache.set(cacheKey, result);
        
        console.log('✅ OpenRouteService success:', distanceKm.toFixed(2), 'km');
        return result;
      } else {
        throw new Error('No routes found in OpenRouteService response');
      }
    } catch (openRouteError) {
      console.error('❌ OpenRouteService failed:', openRouteError.message);
    }
  } else {
    console.log('⚠️ No OpenRouteService API key configured');
  }
  
  // Final fallback - use straight-line distance estimation
  console.log('📏 Using straight-line distance estimation as final fallback');
  const R = 6371; // Earth's radius in km
  const dLat = (destLat - originLat) * Math.PI / 180;
  const dLon = (destLng - originLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(originLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const straightDistance = R * c;
  // Apply 1.4x multiplier for road distance estimation
  const estimatedRoadDistance = Math.round(straightDistance * 1.4 * 100) / 100;
  
  const fallbackResult = {
    success: true,
    distance: estimatedRoadDistance * 1000, // Convert to meters
    distanceKm: estimatedRoadDistance,
    duration: Math.round(estimatedRoadDistance * 60), // Rough estimate: 1km/min average
    durationText: `~${Math.round(estimatedRoadDistance)} min`,
    distanceText: `${estimatedRoadDistance} km`,
    origin,
    destination,
    provider: 'Fallback (Straight-line estimation)'
  };
  
  // Cache the fallback result
  distanceCache.set(cacheKey, fallbackResult);
  
  console.log('📏 Using fallback distance estimation:', estimatedRoadDistance, 'km');
  return fallbackResult;
}

/**
 * Calculate distance from location objects (used by supabasePricingService)
 * @param {object} pickup - Pickup location with coordinates
 * @param {object} dropoff - Dropoff location with coordinates
 * @returns {Promise<number>} - Distance in km (0 on error)
 */
export async function calculateDistanceFromLocations(pickup, dropoff) {
  try {
    // Extract coordinates from location objects
    let originCoords, destCoords;
    
    if (pickup?.coordinates) {
      originCoords = `${pickup.coordinates.lat},${pickup.coordinates.lng}`;
    } else if (pickup?.lat && pickup?.lng) {
      originCoords = `${pickup.lat},${pickup.lng}`;
    } else {
      console.warn('Invalid pickup location for distance calculation');
      return 0;
    }
    
    if (dropoff?.coordinates) {
      destCoords = `${dropoff.coordinates.lat},${dropoff.coordinates.lng}`;
    } else if (dropoff?.lat && dropoff?.lng) {
      destCoords = `${dropoff.lat},${dropoff.lng}`;
    } else {
      console.warn('Invalid dropoff location for distance calculation');
      return 0;
    }

    const result = await calculateDistance(originCoords, destCoords);
    
    if (result.success && result.distanceKm) {
      console.log(`📍 Calculated distance: ${result.distanceKm}km using ${result.provider}`);
      return result.distanceKm;
    }
    
    console.warn('Distance calculation failed, using fallback');
    return 15; // Fallback to 15km
  } catch (error) {
    console.error('Error calculating distance:', error.message);
    return 15; // Fallback to 15km on error
  }
}

// ==================== CACHE MANAGEMENT ====================

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    ...cacheStats,
    autocompleteKeys: placesAutocompleteCache.keys().length,
    detailsKeys: placeDetailsCache.keys().length,
    distanceKeys: distanceCache.keys().length
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  placesAutocompleteCache.flushAll();
  placeDetailsCache.flushAll();
  distanceCache.flushAll();
  console.log('✅ All Google Maps caches cleared');
}

/**
 * Clear specific cache
 */
export function clearCache(cacheType) {
  switch (cacheType) {
    case 'autocomplete':
      placesAutocompleteCache.flushAll();
      break;
    case 'details':
      placeDetailsCache.flushAll();
      break;
    case 'distance':
      distanceCache.flushAll();
      break;
    default:
      console.warn(`Unknown cache type: ${cacheType}`);
  }
}

export default {
  searchPlacesAutocomplete,
  getPlaceDetails,
  calculateDistance,
  calculateDistanceFromLocations,
  getCacheStats,
  clearAllCaches,
  clearCache
};
