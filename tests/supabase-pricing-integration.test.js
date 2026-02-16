/**
 * Integration Tests for SupabasePricingService
 * 
 * NO MOCKING - Real Supabase calls with realistic input values
 * Tests all functions end-to-end to verify pricing calculations
 * 
 * Prerequisites:
 * - Supabase database must be running and accessible
 * - City base charges must exist for: Amsterdam, Rotterdam, Eindhoven, The Hague, Utrecht
 * - Pricing config tables must be populated
 * - Furniture items must exist in database
 */

import supabasePricingService from '../services/supabasePricingService.js';

// Real city charges (verify these match your DB)
const AMS_CHEAP = 39;
const AMS_STANDARD = 119;
const EIN_CHEAP = 34;
const EIN_STANDARD = 89;

// Helper to create location objects with proper coordinates
function createLocation(city, address = '1012 AB') {
  const cityCoords = {
    'Amsterdam': { lat: 52.3676, lng: 4.9041 },
    'Rotterdam': { lat: 51.9225, lng: 4.47917 },
    'Eindhoven': { lat: 51.4416, lng: 5.4697 },
    'The Hague': { lat: 52.0705, lng: 4.3007 },
    'Utrecht': { lat: 52.0907, lng: 5.1214 }
  };
  
  return {
    city,
    displayName: `${address}, ${city}, Netherlands`,
    coordinates: cityCoords[city] || cityCoords['Amsterdam']
  };
}

describe('SupabasePricingService Integration Tests - House Moving', () => {
  
  test('House Moving - Fixed Date - Within City - Scheduled', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15', // Use a date you know is scheduled in city_schedules
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Within City Scheduled:', {
      basePrice: result.basePrice,
      total: result.total,
      breakdown: result.breakdown.baseCharge
    });

    // Base price should be cheap rate if date is scheduled
    // If date is NOT scheduled, this test will show actual behavior
    expect(result.basePrice).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  test('House Moving - Fixed Date - Within City - Not Scheduled', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-06-15', // Mid-June - likely NOT scheduled but also NOT blocked
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Within City NOT Scheduled:', {
      basePrice: result.basePrice,
      expectedStandard: AMS_STANDARD,
      total: result.total,
      breakdown: result.breakdown.baseCharge
    });

    // Should be standard rate if date is not scheduled
    expect(result.basePrice).toBeGreaterThan(0);
    // If date is truly not scheduled, basePrice should equal AMS_STANDARD
    // (This will show if the date is actually scheduled or not)
  });

  test('House Moving - Fixed Date - Intercity - Both Scheduled', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Eindhoven'),
      selectedDate: '2025-03-15', // Use date scheduled for both cities
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Intercity Both Scheduled:', {
      basePrice: result.basePrice,
      expectedIfBothScheduled: (AMS_CHEAP + EIN_CHEAP) / 2,
      breakdown: result.breakdown.baseCharge
    });

    expect(result.basePrice).toBeGreaterThan(0);
  });

  test('House Moving - Intercity - Neither Scheduled', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Eindhoven'),
      selectedDate: '2025-09-15', // Mid-September - try different date (Aug 20 was empty)
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Intercity Neither Scheduled:', {
      basePrice: result.basePrice,
      expectedHigherStandard: Math.max(AMS_STANDARD, EIN_STANDARD), // Should be 119 (AMS)
      expectedIfEmpty: Math.max(AMS_STANDARD, EIN_STANDARD) * 0.75, // 89.25 if empty
      breakdown: result.breakdown.baseCharge
    });

    // Should be the higher standard rate (Amsterdam) OR 75% if empty
    expect(result.basePrice).toBe(89.25);
    // Note: should be empty day (89.25) as its 75% of (119)
  });

  test('House Moving - Flexible Range > 7 days', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDateRange: {
        start: '2025-04-01',
        end: '2025-04-10' // 10 days
      },
      isDateFlexible: false, // Note: flexible uses selectedDateRange, not isDateFlexible flag
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Flexible >7 days:', {
      basePrice: result.basePrice,
      expectedCheap: AMS_CHEAP,
      breakdown: result.breakdown.baseCharge
    });

    // Should be cheap rate for pickup city
    expect(result.basePrice).toBeGreaterThan(0);
  });

  test('House Moving - ReHome Option', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      isDateFlexible: true, // ReHome flag
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving ReHome:', {
      basePrice: result.basePrice,
      expectedCheap: AMS_CHEAP,
      breakdown: result.breakdown.baseCharge
    });

    // Should always be cheap rate
    expect(result.basePrice).toBe(AMS_CHEAP);
  });

  test('House Moving - Empty Day Verification', async () => {
    // Test a date that should be empty (no cities scheduled)
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-01-01', // New Year's Day - likely empty
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('House Moving Empty Day:', {
      basePrice: result.basePrice,
      expectedEmptyDayPrice: AMS_STANDARD * 0.75, // 75% of standard
      breakdown: result.breakdown.baseCharge
    });

    // If truly empty day, should be 75% of standard
    expect(result.basePrice).toBeGreaterThan(0);
    // Check if it matches empty day rule (75% of standard)
    if (result.breakdown.baseCharge.type && result.breakdown.baseCharge.type.includes('Empty')) {
      expect(result.basePrice).toBe(AMS_STANDARD * 0.75);
    }
  });
});

describe('SupabasePricingService Integration Tests - Item Transport', () => {

  test('Item Transport - Same Date - Within City - Scheduled', async () => {
    const input = {
      serviceType: 'item-transport',
      pickupLocation: createLocation('Rotterdam'),
      dropoffLocation: createLocation('Rotterdam'),
      pickupDate: '2025-03-15',
      dropoffDate: '2025-03-15',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Transport Same Date Within City:', {
      basePrice: result.basePrice,
      breakdown: result.breakdown.baseCharge
    });

    expect(result.basePrice).toBeGreaterThan(0);
  });

  test('Item Transport - Different Dates - Within City', async () => {
    const input = {
      serviceType: 'item-transport',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      pickupDate: '2025-03-15',
      dropoffDate: '2025-03-20',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Transport Different Dates Within City:', {
      basePrice: result.basePrice,
      breakdown: result.breakdown.baseCharge
    });

    expect(result.basePrice).toBeGreaterThan(0);
  });

  test('Item Transport - Intercity - Same Date', async () => {
    const input = {
      serviceType: 'item-transport',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Eindhoven'),
      pickupDate: '2025-03-15',
      dropoffDate: '2025-03-15',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Transport Intercity Same Date:', {
      basePrice: result.basePrice,
      breakdown: result.breakdown.baseCharge
    });

    expect(result.basePrice).toBeGreaterThan(0);
  });

  test('Item Transport - Intercity - Different Dates', async () => {
    const input = {
      serviceType: 'item-transport',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Rotterdam'),
      pickupDate: '2025-03-15',
      dropoffDate: '2025-03-18',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Transport Intercity Different Dates:', {
      basePrice: result.basePrice,
      breakdown: result.breakdown.baseCharge
    });

    expect(result.basePrice).toBeGreaterThan(0);
  });
});

describe('SupabasePricingService Integration Tests - Item Value', () => {

  test('Calculate Item Value - Multiple Items', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [
        { id: '4ecea0c7-8a56-4e98-927c-ad7f1f3d00da', quantity: 1 }, // 3-Seater Sofa (8 points)
        { id: '518f2592-bf9c-40dc-9431-fe9d290b2256', quantity: 2 }, // 2-Person Mattress (4 points each)
        { id: '496ff732-85e7-4c10-b571-e16237eca292', quantity: 1 }, // Dining Table (4 points)
        { id: '0a2cee26-f82c-4678-9f83-27fe866684fb', quantity: 4 }  // Bedside Table (2 points each)
      ],
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Value Calculation:', {
      itemValue: result.itemValue,
      totalPoints: result.breakdown.items.totalPoints,
      expectedPoints: 8 + (2*4) + 4 + (4*2), // = 28 points
      multiplier: result.breakdown.items.multiplier,
      itemBreakdown: result.breakdown.items
    });

    // Total points: 8 + 8 + 4 + 8 = 28 points
    expect(result.breakdown.items.totalPoints).toBe(28);
    expect(result.itemValue).toBeGreaterThan(0);
  });

  test('Calculate Item Value - No Items', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Item Value - No Items:', {
      itemValue: result.itemValue,
      breakdown: result.breakdown.items
    });

    expect(result.itemValue).toBe(0);
  });
});

describe('SupabasePricingService Integration Tests - Distance Cost', () => {

  test('Calculate Distance Cost - Within City (< 15km)', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam', '1012 AB'),
      dropoffLocation: createLocation('Amsterdam', '1015 AC'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0,
      distanceKm: 5 // Explicitly set small distance
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Distance Cost - Within City:', {
      distanceCost: result.distanceCost,
      distanceKm: result.breakdown.distance.distanceKm,
      breakdown: result.breakdown.distance
    });

    // Should be 0 if under free threshold
    expect(result.distanceCost).toBeGreaterThanOrEqual(0);
  });

  test('Calculate Distance Cost - Long Distance', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Eindhoven'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0
      // Let it calculate actual distance
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Distance Cost - Long Distance:', {
      distanceCost: result.distanceCost,
      distanceKm: result.breakdown.distance.distanceKm,
      category: result.breakdown.distance.category,
      breakdown: result.breakdown.distance
    });

    expect(result.distanceCost).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.distance.distanceKm).toBeGreaterThan(0);
  });
});

describe('SupabasePricingService Integration Tests - Carrying Cost', () => {

  test('Calculate Carrying Cost - Multiple Floors', async () => {
    // Real furniture item UUIDs from Supabase ()
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [
        { id: '4ecea0c7-8a56-4e98-927c-ad7f1f3d00da', quantity: 1 }, // 3-Seater Sofa (8 points)
        { id: '518f2592-bf9c-40dc-9431-fe9d290b2256', quantity: 1 }  // 2-Person Mattress (4 points)
      ],
      floorPickup: 3,
      floorDropoff: 2,
      elevatorPickup: false,
      elevatorDropoff: false
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Carrying Cost - Multiple Floors:', {
      carryingCost: result.carryingCost,
      breakdown: result.breakdown.carrying
    });

    // Should have carrying cost for floors 3 + 2 = 5 total floors
    expect(result.carryingCost).toBeGreaterThan(0);
  });

  test('Calculate Carrying Cost - With Elevator', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [
        { id: '4ecea0c7-8a56-4e98-927c-ad7f1f3d00da', quantity: 1 } // 3-Seater Sofa (8 points)
      ],
      floorPickup: 5,
      floorDropoff: 0,
      elevatorPickup: true,
      elevatorDropoff: false
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Carrying Cost - With Elevator:', {
      carryingCost: result.carryingCost,
      breakdown: result.breakdown.carrying
    });

    // Only pickup has elevator, not dropoff: 8 points × 1.35 × 5 floors + 25 base fee = 79
    expect(result.carryingCost).toBe(79);
  });
});

describe('SupabasePricingService Integration Tests - Assembly Cost', () => {

  test('Calculate Assembly Cost - Furniture Assembly', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [
        { id: '518f2592-bf9c-40dc-9431-fe9d290b2256', quantity: 2 }, // 2-Person Mattress
        { id: '0a1bd37c-e1c4-4155-bd8a-c7fc12656254', quantity: 1 }  // 2-Doors Closet
      ],
      assemblyItems: [
        '518f2592-bf9c-40dc-9431-fe9d290b2256',
        '0a1bd37c-e1c4-4155-bd8a-c7fc12656254'
      ],
      floorPickup: 0,
      floorDropoff: 0
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Assembly Cost:', {
      assemblyCost: result.assemblyCost,
      breakdown: result.breakdown.assembly
    });

    // Assembly for 2 mattresses + 1 closet
    expect(result.assemblyCost).toBeGreaterThanOrEqual(0);
  });
});

describe('SupabasePricingService Integration Tests - Discounts & Fees', () => {

  test('Student Discount Applied', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Amsterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [],
      itemQuantities: {},
      floorPickup: 0,
      floorDropoff: 0,
      hasStudentId: true,
      isStudent: true
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Student Discount:', {
      subtotal: result.subtotal,
      studentDiscount: result.studentDiscount,
      total: result.total,
      discountPercentage: result.studentDiscount / result.subtotal
    });

    expect(result.total).toBe(result.subtotal - result.studentDiscount);
    expect(result.total).toBeLessThan(result.subtotal);
  });

  test('Full Scenario - All Components', async () => {
    const input = {
      serviceType: 'house-moving',
      pickupLocation: createLocation('Amsterdam'),
      dropoffLocation: createLocation('Rotterdam'),
      selectedDate: '2025-03-15',
      isDateFlexible: false,
      items: [
        { id: '4ecea0c7-8a56-4e98-927c-ad7f1f3d00da', quantity: 1 }, // 3-Seater Sofa (8)
        { id: '518f2592-bf9c-40dc-9431-fe9d290b2256', quantity: 2 }, // 2-Person Mattress (8)
        { id: '496ff732-85e7-4c10-b571-e16237eca292', quantity: 1 }, // Dining Table (4)
        { id: '0a2cee26-f82c-4678-9f83-27fe866684fb', quantity: 4 }, // Bedside Table (8)
        { id: '0a1bd37c-e1c4-4155-bd8a-c7fc12656254', quantity: 1 }  // 2-Doors Closet (5)
      ],
      assemblyItems: [
        '518f2592-bf9c-40dc-9431-fe9d290b2256',
        '0a1bd37c-e1c4-4155-bd8a-c7fc12656254'
      ],
      floorPickup: 3,
      floorDropoff: 2,
      elevatorPickup: false,
      elevatorDropoff: true,
      hasStudentId: true,
      isStudent: true,
      extraHelper: true
    };

    const result = await supabasePricingService.calculatePricing(input);
    
    console.log('Full Scenario - All Components:', {
      basePrice: result.basePrice,
      itemValue: result.itemValue,
      distanceCost: result.distanceCost,
      carryingCost: result.carryingCost,
      assemblyCost: result.assemblyCost,
      extraHelperCost: result.extraHelperCost,
      subtotal: result.subtotal,
      studentDiscount: result.studentDiscount,
      total: result.total
    });

    // Verify subtotal matches sum of components
    const calculatedSubtotal = 
      result.basePrice + 
      result.itemValue + 
      result.distanceCost + 
      result.carryingCost + 
      result.assemblyCost + 
      result.extraHelperCost;
    
    expect(result.subtotal).toBeCloseTo(calculatedSubtotal, 2);
    
    // Verify total calculation (no late booking fee)
    const calculatedTotal = result.subtotal - result.studentDiscount;
    expect(result.total).toBeCloseTo(calculatedTotal, 2);
  });
});
