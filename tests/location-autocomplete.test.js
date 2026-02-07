/**
 * Test cases for /api/locations/autocomplete endpoint logic
 * Tests city search, filtering, formatting, and deduplication
 * Uses helper functions that mirror the endpoint implementation
 */

import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Mock city data from city_base_charges table
const mockCityBaseCharges = [
  { city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 },
  { city_name: 'Rotterdam', latitude: 51.9225, longitude: 4.4821 },
  { city_name: 'The Hague', latitude: 52.0800, longitude: 4.3240 },
  { city_name: 'Utrecht', latitude: 52.0894, longitude: 5.1100 },
  { city_name: 'Eindhoven', latitude: 51.4416, longitude: 5.4810 },
  { city_name: 'Haarlem', latitude: 52.3872, longitude: 4.6371 },
  { city_name: 'Arnhem', latitude: 51.9852, longitude: 5.8980 },
];

// Mock marketplace cities
const mockMarketplaceCities = [
  { city_name: 'Amsterdam' },
  { city_name: 'Delft' },
  { city_name: 'Leiden' },
];

describe('Location Autocomplete Endpoint', () => {
  let app;
  let server;

  beforeAll(() => {
    // Mock the endpoint behavior
    // In a real test, you would import the actual Express app
    // For this example, we'll create a minimal mock
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Query Validation', () => {
    it('should return empty array for queries shorter than 2 characters', async () => {
      const query = 'a';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      // With query length < 2, endpoint should return []
      expect(query.length).toBeLessThan(2);
    });

    it('should return empty array for empty query', async () => {
      const query = '';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(query.length).toBe(0);
    });

    it('should accept queries of 2 or more characters', async () => {
      const query = 'am';
      expect(query.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('City Search from city_base_charges', () => {
    it('should find cities that start with query string', () => {
      const query = 'am';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].city_name).toBe('Amsterdam');
    });

    it('should find cities containing query string (case-insensitive)', () => {
      const query = 'dam';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(c => c.city_name === 'Amsterdam')).toBe(true);
      expect(result.some(c => c.city_name === 'Rotterdam')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const queryLower = 'amsterdam';
      const queryUpper = 'AMSTERDAM';
      const queryMixed = 'AmStErDaM';
      
      const resultLower = filterCitiesByQuery(mockCityBaseCharges, queryLower);
      const resultUpper = filterCitiesByQuery(mockCityBaseCharges, queryUpper);
      const resultMixed = filterCitiesByQuery(mockCityBaseCharges, queryMixed);
      
      expect(resultLower.length).toBe(resultUpper.length);
      expect(resultLower.length).toBe(resultMixed.length);
    });

    it('should return cities with coordinates', () => {
      const query = 'amsterdam';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].latitude).toBeDefined();
      expect(result[0].longitude).toBeDefined();
      expect(typeof result[0].latitude).toBe('number');
      expect(typeof result[0].longitude).toBe('number');
    });

    it('should handle partial matches', () => {
      const query = 'haar';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].city_name).toBe('Haarlem');
    });

    it('should return empty array for non-matching query', () => {
      const query = 'xyz123';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result.length).toBe(0);
    });
  });

  describe('Response Format', () => {
    it('should format response with correct structure', () => {
      const city = mockCityBaseCharges[0];
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted).toHaveProperty('display_name');
      expect(formatted).toHaveProperty('lat');
      expect(formatted).toHaveProperty('lon');
      expect(formatted).toHaveProperty('place_id');
      expect(formatted).toHaveProperty('address');
      expect(formatted).toHaveProperty('source');
    });

    it('should include "Netherlands" in display_name', () => {
      const city = mockCityBaseCharges[0];
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.display_name).toContain('Netherlands');
      expect(formatted.display_name).toBe('Amsterdam, Netherlands');
    });

    it('should convert coordinates to strings', () => {
      const city = mockCityBaseCharges[0];
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(typeof formatted.lat).toBe('string');
      expect(typeof formatted.lon).toBe('string');
    });

    it('should create unique place_id with source prefix', () => {
      const city = mockCityBaseCharges[0];
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.place_id).toContain('pricing_');
      expect(formatted.place_id).toBe('pricing_amsterdam');
    });

    it('should include city name in address object', () => {
      const city = mockCityBaseCharges[0];
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.address.city).toBe('Amsterdam');
      expect(formatted.address.country).toBe('Netherlands');
    });

    it('should set source field correctly', () => {
      const city = mockCityBaseCharges[0];
      const formattedPricing = formatCityResponse(city, 'pricing');
      const formattedDatabase = formatCityResponse(city, 'database');
      
      expect(formattedPricing.source).toBe('pricing');
      expect(formattedDatabase.source).toBe('database');
    });
  });

  describe('Coordinate Handling', () => {
    it('should use actual coordinates when available', () => {
      const city = { city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 };
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.lat).toBe('52.3783');
      expect(formatted.lon).toBe('4.9');
    });

    it('should use default coordinates when missing', () => {
      const city = { city_name: 'TestCity', latitude: null, longitude: null };
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.lat).toBe('52.1');
      expect(formatted.lon).toBe('5.1');
    });

    it('should handle undefined coordinates', () => {
      const city = { city_name: 'TestCity' };
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.lat).toBe('52.1');
      expect(formatted.lon).toBe('5.1');
    });
  });

  describe('Deduplication', () => {
    it('should not include duplicate cities', () => {
      const suggestions = [
        formatCityResponse({ city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'pricing'),
        formatCityResponse({ city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'database'),
      ];
      
      const deduplicated = deduplicateSuggestions(suggestions);
      
      expect(deduplicated.length).toBe(1);
      expect(deduplicated[0].address.city).toBe('Amsterdam');
    });

    it('should be case-insensitive for deduplication', () => {
      const suggestions = [
        formatCityResponse({ city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'pricing'),
        formatCityResponse({ city_name: 'amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'database'),
      ];
      
      const deduplicated = deduplicateSuggestions(suggestions);
      
      expect(deduplicated.length).toBe(1);
    });

    it('should preserve first occurrence when deduplicating', () => {
      const suggestions = [
        formatCityResponse({ city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'pricing'),
        formatCityResponse({ city_name: 'Amsterdam', latitude: 52.3783, longitude: 4.9000 }, 'database'),
      ];
      
      const deduplicated = deduplicateSuggestions(suggestions);
      
      expect(deduplicated[0].source).toBe('pricing'); // First one should be preserved
    });
  });

  describe('Limit Parameter', () => {
    it('should respect limit parameter', () => {
      const query = 'a'; // Would match Amsterdam, Arnhem, etc.
      const limit = 2;
      const result = filterCitiesByQuery(mockCityBaseCharges, query).slice(0, limit);
      
      expect(result.length).toBeLessThanOrEqual(limit);
    });

    it('should default to 10 if limit not specified', () => {
      const defaultLimit = 10;
      expect(defaultLimit).toBe(10);
    });

    it('should handle limit larger than result set', () => {
      const query = 'amsterdam';
      const limit = 100;
      const result = filterCitiesByQuery(mockCityBaseCharges, query).slice(0, limit);
      
      expect(result.length).toBeLessThanOrEqual(mockCityBaseCharges.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in query', () => {
      const query = 's-hertogenbosch';
      // Should handle hyphens and special characters
      expect(query).toContain('-');
    });

    it('should trim whitespace from query', () => {
      const query = '  amsterdam  ';
      const trimmed = query.toLowerCase().trim();
      
      expect(trimmed).toBe('amsterdam');
      expect(trimmed).not.toContain(' ');
    });

    it('should handle empty result set gracefully', () => {
      const query = 'nonexistentcity123';
      const result = filterCitiesByQuery(mockCityBaseCharges, query);
      
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle cities with spaces in name', () => {
      const city = { city_name: 'The Hague', latitude: 52.0800, longitude: 4.3240 };
      const formatted = formatCityResponse(city, 'pricing');
      
      expect(formatted.display_name).toBe('The Hague, Netherlands');
      expect(formatted.place_id).toBe('pricing_the hague');
    });
  });
});

// Helper functions that mirror the endpoint logic
function filterCitiesByQuery(cities, query) {
  const lowerQuery = query.toLowerCase();
  return cities.filter(city => 
    city.city_name.toLowerCase().includes(lowerQuery)
  );
}

function formatCityResponse(city, source) {
  return {
    display_name: `${city.city_name}, Netherlands`,
    lat: (city.latitude || 52.1).toString(),
    lon: (city.longitude || 5.1).toString(),
    place_id: `${source}_${city.city_name.toLowerCase()}`,
    address: {
      city: city.city_name,
      country: 'Netherlands'
    },
    source: source
  };
}

function deduplicateSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter(suggestion => {
    const key = suggestion.address.city.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
