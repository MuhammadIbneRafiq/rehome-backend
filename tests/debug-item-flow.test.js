import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import supabasePricingService from '../services/supabasePricingService.js';
import { supabaseClient } from '../db/params.js';

/**
 * DEBUG TEST: Trace complete flow from item selection to pricing calculation
 * Shows exactly where data comes from and how it's processed
 */
describe('DEBUG: Complete Item Selection to Pricing Flow', () => {
  let config;
  let furnitureItems;

  beforeAll(async () => {
    config = await supabasePricingService.getPricingConfig();
    furnitureItems = config.furnitureItems;
    console.log('\n=== DEBUG: FURNITURE ITEMS FROM DATABASE ===');
    console.log('Total items:', furnitureItems.length);
    console.log('Sample items:');
    furnitureItems.slice(0, 5).forEach(item => {
      console.log(`  - ${item.name} (ID: ${item.id}, Points: ${item.points})`);
    });
  });

  afterAll(async () => {
    try {
      await supabaseClient.removeAllChannels();
    } catch (e) {
      // Ignore cleanup errors
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('Step 1: Frontend Item Selection', () => {
    it('should show how frontend builds item list', () => {
      // Simulate frontend itemQuantities state
      const itemQuantities = {
        'dd7e4197-677c-4ccb-8aa6-38ad40167899': 2, // 2 chairs
        'ca4ca126-5704-4c8b-8447-9243ae18ae47': 1, // 1 sofa
        'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e': 3  // 3 boxes
      };

      console.log('\n=== DEBUG: FRONTEND ITEM QUANTITIES ===');
      console.log('itemQuantities:', itemQuantities);

      // Simulate frontend furnitureItems data
      const frontendFurnitureItems = furnitureItems.map(item => ({
        id: item.id,
        name: item.name,
        points: parseFloat(item.points),
        category: item.category
      }));

      // Simulate frontend itemList creation (lines 1175-1185 in ItemMovingPage.tsx)
      const itemList = frontendFurnitureItems
        .filter((item) => itemQuantities[item.id] && itemQuantities[item.id] > 0)
        .map((item) => {
          const quantity = itemQuantities[item.id];
          return {
            id: item.id,
            name: item.name,
            quantity: quantity,
            points: item.points * quantity  // Frontend calculates points
          };
        });

      console.log('\n=== DEBUG: FRONTEND ITEM LIST (sent to backend) ===');
      console.log('itemList:', JSON.stringify(itemList, null, 2));

      // Verify the frontend calculation
      expect(itemList).toHaveLength(3);
      expect(itemList[0]).toEqual({
        id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899',
        name: 'Chair',
        quantity: 2,
        points: 4 // 2 points * 2 chairs
      });
      expect(itemList[1]).toEqual({
        id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47',
        name: '2-Seater Sofa',
        quantity: 1,
        points: 6 // 6 points * 1 sofa
      });
      expect(itemList[2]).toEqual({
        id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e',
        name: 'Box',
        quantity: 3,
        points: 1.5 // 0.5 points * 3 boxes
      });
    });
  });

  describe('Step 2: Backend Item Value Calculation', () => {
    it('should show how backend processes items from frontend', () => {
      // Items as received from frontend (after JSON.parse in transport.js)
      const itemsFromFrontend = [
        { id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', name: 'Chair', quantity: 2, points: 4 },
        { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', name: '2-Seater Sofa', quantity: 1, points: 6 },
        { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', name: 'Box', quantity: 3, points: 1.5 }
      ];

      console.log('\n=== DEBUG: BACKEND RECEIVING ITEMS ===');
      console.log('itemsFromFrontend:', JSON.stringify(itemsFromFrontend, null, 2));

      const input = {
        serviceType: 'item-transport',
        items: itemsFromFrontend
      };

      console.log('\n=== DEBUG: CALCULATE ITEM VALUE ===');
      const result = supabasePricingService.calculateItemValue(input, config);

      console.log('Result:', result);

      // The backend should use the points provided by frontend
      expect(result.totalPoints).toBe(11.5); // 4 + 6 + 1.5
      expect(result.cost).toBe(11.5); // No multiplier for item-transport
    });

    it('should show what happens when item not found in database', () => {
      // Custom item not in database
      const customItems = [
        { id: 'custom-item-123', name: 'Custom Table', quantity: 1, points: 5 }
      ];

      console.log('\n=== DEBUG: CUSTOM ITEM NOT IN DATABASE ===');
      console.log('customItems:', JSON.stringify(customItems, null, 2));

      const input = {
        serviceType: 'item-transport',
        items: customItems
      };

      const result = supabasePricingService.calculateItemValue(input, config);

      console.log('Result for custom item:', result);

      // Should use the points provided directly
      expect(result.totalPoints).toBe(5);
      expect(result.cost).toBe(5);
    });
  });

  describe('Step 3: Carrying Cost Calculation', () => {
    it('should show carrying cost calculation with floors', () => {
      const items = [
        { id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', name: 'Chair', quantity: 2, points: 4 },
        { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', name: '2-Seater Sofa', quantity: 1, points: 6 }
      ];

      console.log('\n=== DEBUG: CARRYING COST INPUT ===');
      console.log('items:', JSON.stringify(items, null, 2));

      const input = {
        items: items,
        pickupFloors: 2,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false
      };

      console.log('Input:', JSON.stringify(input, null, 2));

      const result = supabasePricingService.calculateCarryingCost(input, config);

      console.log('\n=== DEBUG: CARRYING COST RESULT ===');
      console.log('Result:', JSON.stringify(result, null, 2));

      // Should calculate: (6 points * 1.35 multiplier * 2 floors) + 25 base fee = 41.2
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.floors).toBe(2);
    });

    it('should show carrying cost with elevator', () => {
      const items = [
        { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', name: '2-Seater Sofa', quantity: 1, points: 6 }
      ];

      const input = {
        items: items,
        pickupFloors: 3,
        dropoffFloors: 1,
        hasElevatorPickup: true, // Elevator reduces floors to 1
        hasElevatorDropoff: false
      };

      const result = supabasePricingService.calculateCarryingCost(input, config);

      console.log('\n=== DEBUG: CARRYING COST WITH ELEVATOR ===');
      console.log('Input floors - Pickup: 3 (elevator), Dropoff: 1');
      console.log('Effective floors - Pickup: 1, Dropoff: 1');
      console.log('Result:', JSON.stringify(result, null, 2));

      // Should calculate: (6 points * 1.35 multiplier * 2 floors) + 25 base fee = 41.2
      expect(result.floors).toBe(2); // 1 + 1
      expect(result.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Step 4: Complete Pricing Flow', () => {
    it('should show complete pricing calculation', async () => {
      const input = {
        serviceType: 'item-transport',
        pickupLocation: { 
          city: 'Amsterdam',
          coordinates: { lat: 52.3676, lng: 4.9041 }
        },
        dropoffLocation: { 
          city: 'Rotterdam',
          coordinates: { lat: 51.9225, lng: 4.4792 }
        },
        selectedDate: new Date().toISOString(),
        items: [
          { id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', name: 'Chair', quantity: 2, points: 4 },
          { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', name: '2-Seater Sofa', quantity: 1, points: 6 }
        ],
        pickupFloors: 1,
        dropoffFloors: 0,
        hasElevatorPickup: false,
        hasElevatorDropoff: false,
        needsAssembly: false,
        needsExtraHelper: false,
        hasStudentId: false
      };

      console.log('\n=== DEBUG: COMPLETE PRICING INPUT ===');
      console.log('Input:', JSON.stringify(input, null, 2));

      const result = await supabasePricingService.calculatePricing(input);

      console.log('\n=== DEBUG: COMPLETE PRICING RESULT ===');
      console.log('Base Price:', result.basePrice, '(Amsterdam to Rotterdam)');
      console.log('Item Value:', result.itemValue, '(4 + 6 = 10 points)');
      console.log('Distance Cost:', result.distanceCost, '(Amsterdam to Rotterdam)');
      console.log('Carrying Cost:', result.carryingCost, '(1 floor * 10 points * 1.35 + 25)');
      console.log('Assembly Cost:', result.assemblyCost, '(false)');
      console.log('Extra Helper Cost:', result.extraHelperCost, '(false)');
      console.log('Subtotal:', result.subtotal);
      console.log('Total:', result.total);

      // Verify all components are calculated
      expect(result.basePrice).toBeGreaterThan(0);
      expect(result.itemValue).toBe(10); // 4 + 6 points
      expect(result.distanceCost).toBeGreaterThan(0);
      expect(result.carryingCost).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      console.log('\n=== DEBUG: PRICING BREAKDOWN DETAILS ===');
      console.log(JSON.stringify(result.breakdown, null, 2));
    });
  });

  describe('Step 5: Database Tables Used', () => {
    it('should show which tables provide the data', () => {
      console.log('\n=== DEBUG: DATABASE TABLES AND THEIR DATA ===');
      
      console.log('\n1. furniture_items table:');
      console.log('   - Provides: id, name, points, category');
      console.log('   - Used by: calculateItemValue(), calculateCarryingCost()');
      console.log('   - Sample:', furnitureItems[0]);

      console.log('\n2. city_base_charges table:');
      console.log('   - Provides: city_name, normal, city_day, day_of_week');
      console.log('   - Used by: calculateBaseCharge()');
      console.log('   - Sample Amsterdam:', config.cityCharges.find(c => c.city_name === 'Amsterdam'));

      console.log('\n3. carrying_config table:');
      console.log('   - Provides: item_type, multiplier_per_floor, base_fee');
      console.log('   - Used by: calculateCarryingCost()');
      console.log('   - Sample standard config:', config.carryingConfig.find(c => c.item_type === 'standard'));

      console.log('\n4. distance_pricing_config table:');
      console.log('   - Provides: distance_type, threshold_km, rate_per_km');
      console.log('   - Used by: calculateDistanceCost()');
      console.log('   - Sample:', config.distancePricing);

      console.log('\n5. assembly_pricing_config table:');
      console.log('   - Provides: item_category, item_type, price');
      console.log('   - Used by: calculateAssemblyCost()');
      console.log('   - Sample:', config.assemblyPricing[0]);

      console.log('\n6. extra_helper_config table:');
      console.log('   - Provides: item_threshold, price');
      console.log('   - Used by: calculateExtraHelperCost()');
      console.log('   - Sample:', config.extraHelper);

      console.log('\n7. discounts_fees_config table:');
      console.log('   - Provides: type, percentage, fixed_amount');
      console.log('   - Used by: calculatePricing() for discounts/fees');
      console.log('   - Sample:', config.discountsFees);
    });
  });
});
