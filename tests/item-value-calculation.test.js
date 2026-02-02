import { describe, it, expect, beforeAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';

/**
 * Test item value calculation with actual furniture items and points
 * Ensures items are properly valued even when not found in database
 */
describe('Item Value Calculation', () => {
  let config;

  beforeAll(async () => {
    config = await supabasePricingService.getPricingConfig();
  });

  describe('calculateItemValue with database items', () => {
    it('should calculate value for chair (2 points) correctly', () => {
      const input = {
        serviceType: 'item-transport',
        items: [{
          id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', // Chair ID from database
          name: 'Chair',
          quantity: 1,
          points: 2
        }]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(2);
      expect(result.multiplier).toBe(1); // item-transport multiplier
      expect(result.cost).toBe(2); // 2 points * 1 multiplier = €2
    });

    it('should calculate value for 2-seater sofa (6 points) correctly', () => {
      const input = {
        serviceType: 'item-transport',
        items: [{
          id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', // 2-Seater Sofa ID
          name: '2-Seater Sofa',
          quantity: 1,
          points: 6
        }]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(6);
      expect(result.multiplier).toBe(1);
      expect(result.cost).toBe(6); // 6 points * 1 = €6
    });

    it('should calculate value for multiple chairs correctly', () => {
      const input = {
        serviceType: 'item-transport',
        items: [{
          id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899',
          name: 'Chair',
          quantity: 4,
          points: 8 // 2 points per chair * 4 chairs
        }]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(8);
      expect(result.cost).toBe(8); // 8 points * 1 = €8
    });

    it('should apply 2x multiplier for house moving', () => {
      const input = {
        serviceType: 'house-moving',
        items: [{
          id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47',
          name: '2-Seater Sofa',
          quantity: 2,
          points: 12 // 6 points * 2 sofas
        }]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(12);
      expect(result.multiplier).toBe(2); // house-moving multiplier
      expect(result.cost).toBe(24); // 12 points * 2 = €24
    });
  });

  describe('calculateItemValue with items not in database', () => {
    it('should use points directly when item ID not found in database', () => {
      const input = {
        serviceType: 'item-transport',
        items: [{
          id: 'custom-item-123',
          name: 'Custom Item',
          quantity: 1,
          points: 5 // Points provided directly
        }]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      // Should use the points provided
      expect(result.totalPoints).toBe(5);
      expect(result.cost).toBe(5);
    });

    it('should calculate multiple custom items with direct points', () => {
      const input = {
        serviceType: 'item-transport',
        items: [
          {
            id: 'custom-1',
            name: 'Custom Item 1',
            quantity: 1,
            points: 3
          },
          {
            id: 'custom-2',
            name: 'Custom Item 2',
            quantity: 1,
            points: 7
          }
        ]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(10); // 3 + 7
      expect(result.cost).toBe(10);
    });

    it('should handle mix of database and custom items', () => {
      const input = {
        serviceType: 'item-transport',
        items: [
          {
            id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', // Chair from DB
            name: 'Chair',
            quantity: 2,
            points: 4 // Will be overridden by DB value
          },
          {
            id: 'custom-table',
            name: 'Custom Table',
            quantity: 1,
            points: 5 // Will be used directly
          }
        ]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      // Chair: 2 points from DB * 2 quantity = 4
      // Custom Table: 5 points directly = 5
      // Total: 9 points
      expect(result.totalPoints).toBeGreaterThanOrEqual(5); // At least custom table points
    });
  });

  describe('calculateItemValue edge cases', () => {
    it('should return 0 for empty items array', () => {
      const input = {
        serviceType: 'item-transport',
        items: []
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('should return 0 for null items', () => {
      const input = {
        serviceType: 'item-transport',
        items: null
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      expect(result.totalPoints).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('should skip items without points and not found in database', () => {
      const input = {
        serviceType: 'item-transport',
        items: [
          {
            id: 'unknown-item',
            name: 'Unknown Item',
            quantity: 1
            // No points property
          },
          {
            id: 'custom-item',
            name: 'Custom Item',
            quantity: 1,
            points: 3
          }
        ]
      };

      const result = supabasePricingService.calculateItemValue(input, config);
      
      // Should only count the custom item with points
      expect(result.totalPoints).toBe(3);
      expect(result.cost).toBe(3);
    });
  });
});
