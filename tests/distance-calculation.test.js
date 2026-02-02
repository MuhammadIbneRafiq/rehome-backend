import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';
import { calculateDistanceFromLocations } from '../services/googleMapsService.js';
import { supabaseClient } from '../db/params.js';

/**
 * Test distance calculation with fallback mechanisms
 * Should never return 0 or stuck at 15km when coordinates are valid
 */
describe('Distance Calculation with Fallbacks', () => {
  let config;

  beforeAll(async () => {
    config = await supabasePricingService.getPricingConfig();
  });

  afterAll(async () => {
    // Clean up Supabase connections
    try {
      await supabaseClient.removeAllChannels();
    } catch (e) {
      // Ignore cleanup errors
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('calculateDistance basic functionality', () => {
    it('should calculate distance between Amsterdam and Rotterdam', async () => {
      const pickup = { 
        coordinates: { lat: 52.3676, lng: 4.9041 } // Amsterdam
      };
      const dropoff = { 
        coordinates: { lat: 51.9225, lng: 4.4792 } // Rotterdam
      };

      const distance = await supabasePricingService.calculateDistance(pickup, dropoff);
      
      // Amsterdam to Rotterdam is approximately 57-78 km by road
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(40); // Minimum reasonable distance
      expect(distance).toBeLessThan(100); // Maximum reasonable distance
    });

    it('should calculate distance between Utrecht and Eindhoven', async () => {
      const pickup = { 
        coordinates: { lat: 52.0907, lng: 5.1214 } // Utrecht
      };
      const dropoff = { 
        coordinates: { lat: 51.4416, lng: 5.4697 } // Eindhoven
      };

      const distance = await supabasePricingService.calculateDistance(pickup, dropoff);
      
      // Utrecht to Eindhoven is approximately 80-100 km
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(60); // Minimum reasonable distance
      expect(distance).toBeLessThan(120); // Maximum reasonable distance
    });

    it('should calculate short distance within Amsterdam', async () => {
      const pickup = { 
        coordinates: { lat: 52.3676, lng: 4.9041 } // Amsterdam Central
      };
      const dropoff = { 
        coordinates: { lat: 52.3584, lng: 4.8811 } // Amsterdam West
      };

      const distance = await supabasePricingService.calculateDistance(pickup, dropoff);
      
      // Within city should be less than 10km
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(15);
    });
  });

  describe('calculateDistance with fallback scenarios', () => {
    it('should use fallback calculation when API keys are missing', async () => {
      const pickup = { 
        coordinates: { lat: 52.3676, lng: 4.9041 } 
      };
      const dropoff = { 
        coordinates: { lat: 51.9225, lng: 4.4792 } 
      };

      // Even without API keys, should return reasonable estimate
      const distance = await calculateDistanceFromLocations(pickup, dropoff);
      
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(0);
      expect(distance).not.toBe(15); // Should not be stuck at default 15km
    });

    it('should handle alternative coordinate formats', async () => {
      // Format 1: coordinates object
      const pickup1 = { 
        coordinates: { lat: 52.3676, lng: 4.9041 } 
      };
      
      // Format 2: direct lat/lng
      const dropoff1 = { 
        lat: 51.9225, 
        lng: 4.4792 
      };

      const distance = await calculateDistanceFromLocations(pickup1, dropoff1);
      
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(0);
    });

    it('should return 0 for invalid coordinates', async () => {
      const pickup = { 
        city: 'Amsterdam' // No coordinates
      };
      const dropoff = { 
        city: 'Rotterdam' // No coordinates
      };

      const distance = await calculateDistanceFromLocations(pickup, dropoff);
      
      expect(distance).toBe(0); // Invalid input should return 0
    });

    it('should return 0 for null locations', async () => {
      const distance = await calculateDistanceFromLocations(null, null);
      
      expect(distance).toBe(0);
    });
  });

  describe('calculateDistanceCost integration', () => {
    it('should calculate distance cost for Amsterdam to Rotterdam', async () => {
      const input = {
        pickupLocation: { 
          coordinates: { lat: 52.3676, lng: 4.9041 },
          city: 'Amsterdam'
        },
        dropoffLocation: { 
          coordinates: { lat: 51.9225, lng: 4.4792 },
          city: 'Rotterdam'
        }
      };

      const result = await supabasePricingService.calculateDistanceCost(input, config);
      
      expect(result).toBeDefined();
      expect(result.distanceKm).toBeGreaterThan(40);
      expect(result.distanceKm).toBeLessThan(100);
      expect(result.cost).toBe(result.distanceKm * result.rate);
      expect(['small', 'medium', 'long']).toContain(result.category);
    });

    it('should apply correct rate based on distance category', async () => {
      // Short distance (< 10km)
      const shortInput = {
        pickupLocation: { 
          coordinates: { lat: 52.3676, lng: 4.9041 } // Amsterdam Central
        },
        dropoffLocation: { 
          coordinates: { lat: 52.3584, lng: 4.8811 } // Amsterdam West
        }
      };

      const shortResult = await supabasePricingService.calculateDistanceCost(shortInput, config);
      
      // Long distance (> 50km)
      const longInput = {
        pickupLocation: { 
          coordinates: { lat: 52.3676, lng: 4.9041 } // Amsterdam
        },
        dropoffLocation: { 
          coordinates: { lat: 51.4416, lng: 5.4697 } // Eindhoven
        }
      };

      const longResult = await supabasePricingService.calculateDistanceCost(longInput, config);
      
      // Verify different categories have different rates
      expect(shortResult.category).not.toBe(longResult.category);
      if (shortResult.distanceKm < longResult.distanceKm) {
        expect(shortResult.rate).toBeGreaterThanOrEqual(longResult.rate); // Shorter distances may have higher per-km rate
      }
    });
  });

  describe('Complete pricing calculation with distance', () => {
    it('should include distance cost in total pricing', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { 
          coordinates: { lat: 52.3676, lng: 4.9041 },
          city: 'Amsterdam'
        },
        dropoffLocation: { 
          coordinates: { lat: 51.9225, lng: 4.4792 },
          city: 'Rotterdam'
        },
        selectedDate: new Date().toISOString(),
        items: [{
          id: 'chair-123',
          name: 'Chair',
          quantity: 2,
          points: 4
        }],
        pickupFloors: 0,
        dropoffFloors: 0
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      // Should have all pricing components
      expect(result.basePrice).toBeGreaterThan(0);
      expect(result.itemValue).toBe(4); // 4 points * 1 multiplier
      expect(result.distanceCost).toBeGreaterThan(0);
      expect(result.distanceCost).not.toBe(15 * 0.5); // Should not be stuck at fallback 15km
      
      // Total should include all components
      expect(result.total).toBe(
        result.basePrice + 
        result.itemValue + 
        result.distanceCost + 
        result.carryingCost + 
        result.assemblyCost + 
        result.extraHelperCost - 
        result.studentDiscount + 
        result.lateBookingFee
      );
    });

    it('should calculate pricing even with fallback distance', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { 
          coordinates: { lat: 52.5200, lng: 4.6800 }, // Zaandam
          city: 'Zaandam'
        },
        dropoffLocation: { 
          coordinates: { lat: 52.4584, lng: 5.1028 }, // Marken
          city: 'Marken'
        },
        selectedDate: new Date().toISOString(),
        items: [{
          id: 'box-123',
          name: 'Box',
          quantity: 5,
          points: 2.5
        }],
        pickupFloors: 1,
        dropoffFloors: 0,
        hasElevatorPickup: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      // Even with fallback, should have valid pricing
      expect(result.basePrice).toBeGreaterThan(0);
      expect(result.itemValue).toBe(2.5); // 2.5 points * 1 multiplier
      expect(result.distanceCost).toBeGreaterThan(0);
      expect(result.carryingCost).toBeGreaterThan(0); // Has 1 floor
      expect(result.total).toBeGreaterThan(0);
      
      // Distance should be reasonable for Zaandam to Marken (~20-30km)
      expect(result.breakdown.distance.distanceKm).toBeGreaterThan(10);
      expect(result.breakdown.distance.distanceKm).toBeLessThan(50);
    });
  });
});
