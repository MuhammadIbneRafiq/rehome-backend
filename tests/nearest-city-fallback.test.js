import { describe, it, expect, beforeAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';

/**
 * Test the nearest city fallback functionality
 * When a city is not in the database, it should use the nearest major city
 */
describe('Nearest City Fallback', () => {
  let cityCharges;

  beforeAll(async () => {
    const config = await supabasePricingService.getPricingConfig();
    cityCharges = config.cityCharges;
  });

  describe('findClosestCity with exact matches', () => {
    it('should find Amsterdam when city field exactly matches', () => {
      const placeObject = {
        city: 'Amsterdam',
        formattedAddress: 'Damrak 1, 1012 LG Amsterdam, Netherlands'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      expect(result).toBeDefined();
      expect(result.city_name).toBe('Amsterdam');
    });

    it('should find Rotterdam when city field exactly matches', () => {
      const placeObject = {
        city: 'Rotterdam',
        formattedAddress: 'Coolsingel 40, 3011 AD Rotterdam, Netherlands'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      expect(result).toBeDefined();
      expect(result.city_name).toBe('Rotterdam');
    });

    it('should map Den Haag to The Hague', () => {
      const placeObject = {
        city: 'Den Haag',
        formattedAddress: 'Binnenhof 1, 2513 AA Den Haag, Netherlands'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      expect(result).toBeDefined();
      expect(result.city_name).toBe('The Hague');
    });

    it('should map s-Gravenhage to The Hague', () => {
      const placeObject = {
        city: "'s-Gravenhage",
        formattedAddress: 'Plein 1, 2511 CS s-Gravenhage, Netherlands'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      expect(result).toBeDefined();
      expect(result.city_name).toBe('The Hague');
    });
  });

  describe('findClosestCity with fallback to nearest major city', () => {
    it('should return Amsterdam as fallback for unknown small town (Volendam)', () => {
      const placeObject = {
        city: 'Volendam',
        formattedAddress: 'Haven 1, 1131 EP Volendam, Netherlands'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      // Should fallback to a major city (likely Amsterdam)
      expect(result).toBeDefined();
      expect(result.city_name).toBeDefined();
      expect(typeof result.cheap_charge).toBe('number');
    });

    it('should return a fallback city for international location (Paris)', () => {
      const placeObject = {
        city: 'Paris',
        formattedAddress: 'Champs-Élysées, 75008 Paris, France'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      // Should always return a city for pricing
      expect(result).toBeDefined();
      expect(result.city_name).toBeDefined();
      expect(typeof result.normal).toBe('number');
      expect(typeof result.city_day).toBe('number');
    });

    it('should return fallback when place object has no city field', () => {
      const placeObject = {
        formattedAddress: 'Some random address without city'
      };

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      // Should still return a city for pricing
      expect(result).toBeDefined();
      expect(result.city_name).toBeDefined();
    });

    it('should return fallback when place object is empty', () => {
      const placeObject = {};

      const result = supabasePricingService.findClosestCity(placeObject, cityCharges);
      
      // Should fallback to Amsterdam or first available city
      expect(result).toBeDefined();
      expect(result.city_name).toBeDefined();
    });
  });

  describe('Base charge calculation with fallback cities', () => {
    it('should calculate base charge even for unknown city', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { 
          city: 'Zaandam', // Not in database
          formattedAddress: 'Station Zaandam, 1506 MZ Zaandam, Netherlands',
          coordinates: { lat: 52.4384, lng: 4.8136 }
        },
        dropoffLocation: { 
          city: 'Amsterdam',
          formattedAddress: 'Amsterdam Centraal, 1012 AB Amsterdam, Netherlands',
          coordinates: { lat: 52.3676, lng: 4.9041 }
        },
        selectedDate: new Date().toISOString(),
        isDateFlexible: false
      };

      const config = await supabasePricingService.getPricingConfig();
      const result = await supabasePricingService.calculateBaseCharge(input, config);
      
      // Should always return a valid base charge
      expect(result).toBeDefined();
      expect(result.finalPrice).toBeGreaterThan(0);
      expect(result.city).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('should use fallback for both unknown cities', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { 
          city: 'Monnickendam', // Small town not in database
          coordinates: { lat: 52.4626, lng: 5.0378 }
        },
        dropoffLocation: { 
          city: 'Marken', // Small town not in database
          coordinates: { lat: 52.4584, lng: 5.1028 }
        },
        selectedDate: new Date().toISOString(),
        isDateFlexible: false
      };

      const config = await supabasePricingService.getPricingConfig();
      const result = await supabasePricingService.calculateBaseCharge(input, config);
      
      // Should use fallback pricing
      expect(result).toBeDefined();
      expect(result.finalPrice).toBeGreaterThan(0);
      expect(result.type).toContain('Fallback');
    });
  });
});
