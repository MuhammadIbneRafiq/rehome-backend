import { describe, it, expect, beforeAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';

describe('Comprehensive Pricing Scenarios Tests', () => {
  let config;

  beforeAll(async () => {
    // Load pricing configuration once
    config = await supabasePricingService.getPricingConfig();
  });

  describe('Fixed Date - House Moving', () => {
    describe('Within City', () => {
      it('should apply cheap base charge when city is included in calendar', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          selectedDate: '2024-02-15', // Assume this date has Amsterdam scheduled
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Scheduled');
        expect(result.isCityDay).toBe(true);
      });

      it('should apply 75% of standard charge for empty day', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          selectedDate: '2024-02-20', // Assume empty day
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Empty');
        // Should be 75% of normal rate
      });

      it('should apply standard charge when city not included', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          dropoffLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          selectedDate: '2024-02-25', // Assume not scheduled
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Standard');
        expect(result.isCityDay).toBe(false);
      });
    });

    describe('Between Cities', () => {
      it('should average cheap charges when both cities included', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          selectedDate: '2024-02-15', // Both cities scheduled
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Both Scheduled');
      });

      it('should mix cheap and standard when only pickup included', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Den Haag', coordinates: { lat: 52.0705, lng: 4.3007 } },
          selectedDate: '2024-02-15', // Only Amsterdam scheduled
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Pickup Scheduled');
      });

      it('should use 75% of higher standard for empty day', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          dropoffLocation: { city: 'Eindhoven', coordinates: { lat: 51.4416, lng: 5.4697 } },
          selectedDate: '2024-02-20', // Empty day
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Empty');
      });

      it('should use higher standard charge when none included', async () => {
        const input = {
          serviceType: 'house_moving',
          pickupLocation: { city: 'Groningen', coordinates: { lat: 53.2194, lng: 6.5665 } },
          dropoffLocation: { city: 'Maastricht', coordinates: { lat: 50.8514, lng: 5.6909 } },
          selectedDate: '2024-02-25', // Neither city scheduled
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateBaseCharge(input, config);
        expect(result.type).toContain('Higher Standard');
      });
    });
  });

  describe('Fixed Date - Item Transport', () => {
    describe('Within City, Same Date', () => {
      it('should apply cheap charge when city included', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          pickupDate: '2024-02-15',
          dropoffDate: '2024-02-15',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Amsterdam', 'Amsterdam', 
          { normal: 50, cityDay: 35 },
          { normal: 50, cityDay: 35 }
        );

        expect(result[1]).toContain('Scheduled');
        expect(result[2]).toBe(true);
      });

      it('should apply 75% standard for empty day', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          pickupDate: '2024-02-20',
          dropoffDate: '2024-02-20',
          isDateFlexible: false
        };

        // Mock empty day scenario
        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Rotterdam', 'Rotterdam',
          { normal: 50, cityDay: 35 },
          { normal: 50, cityDay: 35 }
        );

        expect(result[1]).toContain('Empty');
      });
    });

    describe('Within City, Different Dates', () => {
      it('should apply cheap charge when both dates included', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          pickupDate: '2024-02-15',
          dropoffDate: '2024-02-16',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Amsterdam', 'Amsterdam',
          { normal: 50, cityDay: 35 },
          { normal: 50, cityDay: 35 }
        );

        expect(result[1]).toContain('Both Scheduled');
      });

      it('should average when only one date included', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          dropoffLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          pickupDate: '2024-02-15',
          dropoffDate: '2024-02-20',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Utrecht', 'Utrecht',
          { normal: 50, cityDay: 35 },
          { normal: 50, cityDay: 35 }
        );

        expect(result[1]).toContain('One Scheduled');
        expect(result[0]).toBe((35 + 50) / 2);
      });

      it('should apply 75% standard when both empty', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Den Haag', coordinates: { lat: 52.0705, lng: 4.3007 } },
          dropoffLocation: { city: 'Den Haag', coordinates: { lat: 52.0705, lng: 4.3007 } },
          pickupDate: '2024-02-20',
          dropoffDate: '2024-02-21',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Den Haag', 'Den Haag',
          { normal: 50, cityDay: 35 },
          { normal: 50, cityDay: 35 }
        );

        expect(result[1]).toContain('Both Empty');
        expect(result[0]).toBe(50 * 0.75);
      });
    });

    describe('Between Cities, Same Date', () => {
      it('should average cheap charges when both included', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          pickupDate: '2024-02-15',
          dropoffDate: '2024-02-15',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Amsterdam', 'Rotterdam',
          { normal: 50, cityDay: 35 },
          { normal: 48, cityDay: 33 }
        );

        expect(result[1]).toContain('Both Scheduled');
        expect(result[0]).toBe((35 + 33) / 2);
      });

      it('should average standard charges for empty day', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          dropoffLocation: { city: 'Eindhoven', coordinates: { lat: 51.4416, lng: 5.4697 } },
          pickupDate: '2024-02-20',
          dropoffDate: '2024-02-20',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Utrecht', 'Eindhoven',
          { normal: 50, cityDay: 35 },
          { normal: 48, cityDay: 33 }
        );

        expect(result[1]).toContain('Empty');
      });

      it('should use higher standard when none included', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Groningen', coordinates: { lat: 53.2194, lng: 6.5665 } },
          dropoffLocation: { city: 'Maastricht', coordinates: { lat: 50.8514, lng: 5.6909 } },
          pickupDate: '2024-02-25',
          dropoffDate: '2024-02-25',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Groningen', 'Maastricht',
          { normal: 55, cityDay: 38 },
          { normal: 52, cityDay: 36 }
        );

        expect(result[1]).toContain('Higher Standard');
        expect(result[0]).toBe(Math.max(55, 52));
      });
    });

    describe('Between Cities, Different Dates', () => {
      it('should average cheap charges when both cities included on their dates', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
          dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
          pickupDate: '2024-02-15',
          dropoffDate: '2024-02-16',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Amsterdam', 'Rotterdam',
          { normal: 50, cityDay: 35 },
          { normal: 48, cityDay: 33 }
        );

        expect(result[1]).toContain('Both Scheduled');
        expect(result[0]).toBe((35 + 33) / 2);
      });

      it('should average when both days empty', async () => {
        const input = {
          serviceType: 'item_transport',
          pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
          dropoffLocation: { city: 'Eindhoven', coordinates: { lat: 51.4416, lng: 5.4697 } },
          pickupDate: '2024-02-20',
          dropoffDate: '2024-02-21',
          isDateFlexible: false
        };

        const result = await supabasePricingService.calculateIntercityItemTransportCharge(
          input, 'Utrecht', 'Eindhoven',
          { normal: 50, cityDay: 35 },
          { normal: 48, cityDay: 33 }
        );

        expect(result[1]).toContain('Both Empty');
        expect(result[0]).toBe((50 + 48) / 2);
      });
    });
  });

  describe('Flexible Date Range', () => {
    it('should display cheap charge for range above 7 days', async () => {
      const input = {
        serviceType: 'house_moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
        selectedDateRange: { start: '2024-02-01', end: '2024-02-15' },
        isDateFlexible: false
      };

      const result = await supabasePricingService.calculateBaseCharge(input, config);
      expect(result.type).toContain('>7 days');
      expect(result.isCityDay).toBe(true);
    });

    it('should check availability for range below 7 days', async () => {
      const input = {
        serviceType: 'house_moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        selectedDateRange: { start: '2024-02-15', end: '2024-02-18' },
        isDateFlexible: false
      };

      const result = await supabasePricingService.calculateBaseCharge(input, config);
      expect(result.type).toMatch(/Flexible Range/);
    });

    it('should use standard for intercity when not both available', async () => {
      const input = {
        serviceType: 'house_moving',
        pickupLocation: { city: 'Utrecht', coordinates: { lat: 52.0907, lng: 5.1214 } },
        dropoffLocation: { city: 'Eindhoven', coordinates: { lat: 51.4416, lng: 5.4697 } },
        selectedDateRange: { start: '2024-02-20', end: '2024-02-22' },
        isDateFlexible: false
      };

      const result = await supabasePricingService.calculateBaseCharge(input, config);
      expect(result.type).toContain('Standard');
    });
  });

  describe('ReHome Can Suggest', () => {
    it('should always return cheapest base charge for pickup city', async () => {
      const input = {
        serviceType: 'house_moving',
        pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
        dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
        isDateFlexible: true // ReHome choose option
      };

      const result = await supabasePricingService.calculateBaseCharge(input, config);
      expect(result.type).toContain('ReHome Choose');
      expect(result.isCityDay).toBe(true);
    });
  });

  describe('Distance Calculation', () => {
    it('should calculate actual distance instead of using 15km fallback', async () => {
      const input = {
        pickupLocation: { 
          city: 'Amsterdam', 
          coordinates: { lat: 52.3676, lng: 4.9041 }
        },
        dropoffLocation: { 
          city: 'Rotterdam', 
          coordinates: { lat: 51.9225, lng: 4.4792 }
        }
      };

      const result = await supabasePricingService.calculateDistanceCost(input, config);
      expect(result.distanceKm).not.toBe(15); // Should not be hardcoded 15km
      expect(result.distanceKm).toBeGreaterThan(50); // Amsterdam to Rotterdam is ~60km
    });

    it('should apply free distance for short distances', async () => {
      const input = {
        pickupLocation: { 
          city: 'Amsterdam', 
          coordinates: { lat: 52.3676, lng: 4.9041 }
        },
        dropoffLocation: { 
          city: 'Amsterdam', 
          coordinates: { lat: 52.3700, lng: 4.9100 } // Very close
        }
      };

      const result = await supabasePricingService.calculateDistanceCost(input, config);
      expect(result.cost).toBe(0);
    });
  });
});
