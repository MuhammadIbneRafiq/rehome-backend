import { describe, it, expect, beforeAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';

describe('Subtotal vs Total Discrepancy Tests', () => {
  let config;

  beforeAll(async () => {
    // Load pricing configuration once
    config = await supabasePricingService.getPricingConfig();
  });

  describe('Item Transport Pricing Tests', () => {
    it('should have subtotal = total when no discounts/fees applied', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [
          { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 1, points: 0.5 } // Box
        ],
        hasStudentId: false,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('=== ITEM TRANSPORT BASE TEST ===');
      console.log('Base Price:', result.basePrice);
      console.log('Item Value:', result.itemValue);
      console.log('Distance Cost:', result.distanceCost);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Assembly Cost:', result.assemblyCost);
      console.log('Extra Helper Cost:', result.extraHelperCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Subtotal - Total:', result.subtotal - result.total);

      // When no discounts/fees, subtotal should equal total
      expect(result.subtotal).toBe(result.total);
      expect(result.studentDiscount).toBe(0);
    });

    it('should have total < subtotal when student discount applied', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [
          { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 } // 2-Seater Sofa
        ],
        hasStudentId: true,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== ITEM TRANSPORT STUDENT DISCOUNT TEST ===');
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Expected Total:', result.subtotal - result.studentDiscount);
      console.log('Actual Total:', result.total);
      console.log('Difference:', (result.subtotal - result.studentDiscount) - result.total);

      // Student discount should reduce total
      expect(result.studentDiscount).toBeGreaterThan(0);
      expect(result.total).toBeLessThan(result.subtotal);
      expect(result.total).toBe(result.subtotal - result.studentDiscount);
          });

    it('should handle complex item transport with all services', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [
          { id: 'd0256ffe-c45b-4127-876f-9485d3e5680e', quantity: 1, points: 3 }, // 1-Person Bed
          { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 }  // 2-Seater Sofa
        ],
        hasStudentId: true,
        needsAssembly: true,
        needsExtraHelper: true,
        pickupFloors: 2,
        dropoffFloors: 1,
        hasElevatorPickup: false,
        hasElevatorDropoff: true,
        daysUntilMove: 1 // Urgent booking
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== ITEM TRANSPORT COMPLEX TEST ===');
      console.log('Base Price:', result.basePrice);
      console.log('Item Value:', result.itemValue);
      console.log('Distance Cost:', result.distanceCost);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Assembly Cost:', result.assemblyCost);
      console.log('Extra Helper Cost:', result.extraHelperCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Expected Total:', result.subtotal - result.studentDiscount);
      console.log('Actual Total:', result.total);
      console.log('Difference:', (result.subtotal - result.studentDiscount) - result.total);

      // Verify the formula: total = subtotal - studentDiscount
      const expectedTotal = result.subtotal - result.studentDiscount;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });
  });

  describe('House Moving Pricing Tests', () => {
    it('should have subtotal = total when no discounts/fees applied', async () => {
      const input = {
        serviceType: 'house-moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        selectedDate: '2024-02-15',
        items: [
          { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 1, points: 0.5 } // Box
        ],
        hasStudentId: false,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== HOUSE MOVING BASE TEST ===');
      console.log('Base Price:', result.basePrice);
      console.log('Item Value:', result.itemValue);
      console.log('Distance Cost:', result.distanceCost);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Assembly Cost:', result.assemblyCost);
      console.log('Extra Helper Cost:', result.extraHelperCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Subtotal - Total:', result.subtotal - result.total);

      // When no discounts/fees, subtotal should equal total
      expect(result.subtotal).toBe(result.total);
      expect(result.studentDiscount).toBe(0);
    });

    it('should apply 2x multiplier for house moving item values', async () => {
      const input = {
        serviceType: 'house-moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        selectedDate: '2024-02-15',
        items: [
          { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 } // 2-Seater Sofa
        ],
        hasStudentId: false,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== HOUSE MOVING MULTIPLIER TEST ===');
      console.log('Item Value (should be 2x points):', result.itemValue);
      console.log('Expected Item Value:', 6 * 2); // 6 points * 2 multiplier
      console.log('Subtotal:', result.subtotal);
      console.log('Total:', result.total);

      // House moving should apply 2x multiplier to item values
      expect(result.itemValue).toBe(6 * 2); // 6 points * 2 multiplier
      expect(result.subtotal).toBe(result.total);
    });

    it('should handle complex house moving with all services', async () => {
      const input = {
        serviceType: 'house-moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
        selectedDate: '2024-02-15',
        items: [
          { id: 'd0256ffe-c45b-4127-876f-9485d3e5680e', quantity: 2, points: 3 }, // 2x 1-Person Bed
          { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 }  // 1x 2-Seater Sofa
        ],
        hasStudentId: true,
        needsAssembly: true,
        needsExtraHelper: true,
        pickupFloors: 3,
        dropoffFloors: 2,
        hasElevatorPickup: false,
        hasElevatorDropoff: false,
        daysUntilMove: 2 // Late booking
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== HOUSE MOVING COMPLEX TEST ===');
      console.log('Base Price:', result.basePrice);
      console.log('Item Value:', result.itemValue);
      console.log('Distance Cost:', result.distanceCost);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Assembly Cost:', result.assemblyCost);
      console.log('Extra Helper Cost:', result.extraHelperCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Expected Total:', result.subtotal - result.studentDiscount);
      console.log('Actual Total:', result.total);
      console.log('Difference:', (result.subtotal - result.studentDiscount) - result.total);

      // Verify the formula: total = subtotal - studentDiscount
      const expectedTotal = result.subtotal - result.studentDiscount;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
      
      // House moving should apply 2x multiplier
      // Total points: (2 * 3) + (1 * 6) = 12 points
      // With 2x multiplier: 12 * 2 = 24
      expect(result.itemValue).toBe(24);
    });
  });

  describe('Edge Cases and Bug Detection', () => {
    it('should handle zero values correctly', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [], // No items
        hasStudentId: false,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== EDGE CASE: ZERO VALUES ===');
      console.log('Base Price:', result.basePrice);
      console.log('Item Value:', result.itemValue);
      console.log('Distance Cost:', result.distanceCost);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Assembly Cost:', result.assemblyCost);
      console.log('Extra Helper Cost:', result.extraHelperCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Total:', result.total);

      // Should handle zero values gracefully
      expect(result.itemValue).toBe(0);
      expect(result.carryingCost).toBe(0);
      expect(result.assemblyCost).toBe(0);
      expect(result.extraHelperCost).toBe(0);
      expect(result.subtotal).toBe(result.total);
    });

    it('should handle null/undefined values gracefully', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [
          { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 1, points: 0.5 }
        ],
        hasStudentId: false,
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: null,
        dropoffFloors: undefined,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== EDGE CASE: NULL/UNDEFINED VALUES ===');
      console.log('Base Price:', result.basePrice);
      console.log('Carrying Cost:', result.carryingCost);
      console.log('Subtotal:', result.subtotal);
      console.log('Total:', result.total);

      // Should handle null/undefined gracefully
      expect(result.carryingCost).toBe(0);
      expect(result.subtotal).toBe(result.total);
    });

    it('should detect floating point precision issues', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        pickupDate: '2024-02-15',
        dropoffDate: '2024-02-15',
        items: [
          { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 3, points: 0.5 } // 3 boxes = 1.5 points
        ],
        hasStudentId: true, // 8.85% discount
        needsAssembly: false,
        needsExtraHelper: false,
        pickupFloors: 0,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      const result = await supabasePricingService.calculatePricing(input);
      
      console.log('\n=== EDGE CASE: FLOATING POINT PRECISION ===');
      console.log('Subtotal:', result.subtotal);
      console.log('Student Discount:', result.studentDiscount);
      console.log('Total:', result.total);
      console.log('Expected Total:', result.subtotal - result.studentDiscount);
      console.log('Actual Total:', result.total);
      console.log('Precision Difference:', Math.abs((result.subtotal - result.studentDiscount) - result.total));

      // Check for floating point precision issues
      const expectedTotal = result.subtotal - result.studentDiscount;
      const precisionDiff = Math.abs(expectedTotal - result.total);
      expect(precisionDiff).toBeLessThan(0.01); // Allow small floating point differences
    });
  });
});
