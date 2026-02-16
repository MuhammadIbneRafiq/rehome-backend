import supabasePricingService from './services/supabasePricingService.js';

async function runPricingTests() {
  console.log('=== PRICING DISCREPANCY ANALYSIS ===\n');
  
  // Load config
  const config = await supabasePricingService.getPricingConfig();
  
  // Test 1: Basic Item Transport
  console.log('1. BASIC ITEM TRANSPORT (no discounts/fees):');
  const input1 = {
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
    pickupFloors: 0,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };

  const result1 = await supabasePricingService.calculatePricing(input1);
  console.log('  Base Price:', result1.basePrice);
  console.log('  Item Value:', result1.itemValue);
  console.log('  Distance Cost:', result1.distanceCost);
  console.log('  Carrying Cost:', result1.carryingCost);
  console.log('  Assembly Cost:', result1.assemblyCost);
  console.log('  Extra Helper Cost:', result1.extraHelperCost);
  console.log('  Subtotal:', result1.subtotal);
  console.log('  Student Discount:', result1.studentDiscount);
  console.log('  Total:', result1.total);
  console.log('  Subtotal == Total:', result1.subtotal === result1.total);
  console.log('  Difference:', result1.subtotal - result1.total);
  console.log('');

  // Test 2: Student Discount
  console.log('2. ITEM TRANSPORT WITH STUDENT DISCOUNT:');
  const input2 = {
    ...input1,
    hasStudentId: true,
    items: [
      { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 }
    ]
  };

  const result2 = await supabasePricingService.calculatePricing(input2);
  console.log('  Subtotal:', result2.subtotal);
  console.log('  Student Discount:', result2.studentDiscount);
  console.log('  Total:', result2.total);
  console.log('  Expected Total:', result2.subtotal - result2.studentDiscount);
  console.log('  Formula Correct:', result2.total === (result2.subtotal - result2.studentDiscount));
  console.log('  Difference:', (result2.subtotal - result2.studentDiscount) - result2.total);
  console.log('');

  // Test 3: House Moving
  console.log('3. HOUSE MOVING (2x multiplier):');
  const input3 = {
    serviceType: 'house-moving',
    pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
    dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
    selectedDate: '2024-02-15',
    items: [
      { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 }
    ],
    hasStudentId: false,
    needsAssembly: false,
    needsExtraHelper: false,
    pickupFloors: 0,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };

  const result3 = await supabasePricingService.calculatePricing(input3);
  console.log('  Item Value (should be 12):', result3.itemValue);
  console.log('  Expected Item Value:', 6 * 2);
  console.log('  Multiplier Applied:', result3.itemValue === 12);
  console.log('  Subtotal:', result3.subtotal);
  console.log('  Total:', result3.total);
  console.log('  Subtotal == Total:', result3.subtotal === result3.total);
  console.log('');

  // Test 4: Complex Scenario
  console.log('4. COMPLEX SCENARIO (all services):');
  const input4 = {
    serviceType: 'item-transport',
    pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
    dropoffLocation: { city: 'Rotterdam', coordinates: { lat: 51.9225, lng: 4.4792 } },
    pickupDate: '2024-02-15',
    dropoffDate: '2024-02-15',
    items: [
      { id: 'd0256ffe-c45b-4127-876f-9485d3e5680e', quantity: 1, points: 3 },
      { id: 'ca4ca126-5704-4c8b-8447-9243ae18ae47', quantity: 1, points: 6 }
    ],
    hasStudentId: true,
    needsAssembly: true,
    needsExtraHelper: true,
    pickupFloors: 2,
    dropoffFloors: 1,
    hasElevatorPickup: false,
    hasElevatorDropoff: true,
    daysUntilMove: 1
  };

  const result4 = await supabasePricingService.calculatePricing(input4);
  console.log('  Base Price:', result4.basePrice);
  console.log('  Item Value:', result4.itemValue);
  console.log('  Distance Cost:', result4.distanceCost);
  console.log('  Carrying Cost:', result4.carryingCost);
  console.log('  Assembly Cost:', result4.assemblyCost);
  console.log('  Extra Helper Cost:', result4.extraHelperCost);
  console.log('  Subtotal:', result4.subtotal);
  console.log('  Student Discount:', result4.studentDiscount);
  console.log('  Total:', result4.total);
  
  const expectedTotal4 = result4.subtotal - result4.studentDiscount;
  console.log('  Expected Total:', expectedTotal4);
  console.log('  Formula Correct:', result4.total === expectedTotal4);
  console.log('  Difference:', expectedTotal4 - result4.total);
  console.log('');

  // Test 5: Edge Case - Zero Values
  console.log('5. EDGE CASE - ZERO VALUES:');
  const input5 = {
    serviceType: 'item-transport',
    pickupLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
    dropoffLocation: { city: 'Amsterdam', coordinates: { lat: 52.3676, lng: 4.9041 } },
    pickupDate: '2024-02-15',
    dropoffDate: '2024-02-15',
    items: [],
    hasStudentId: false,
    needsAssembly: false,
    needsExtraHelper: false,
    pickupFloors: 0,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };

  const result5 = await supabasePricingService.calculatePricing(input5);
  console.log('  Item Value:', result5.itemValue);
  console.log('  Carrying Cost:', result5.carryingCost);
  console.log('  Assembly Cost:', result5.assemblyCost);
  console.log('  Extra Helper Cost:', result5.extraHelperCost);
  console.log('  Subtotal:', result5.subtotal);
  console.log('  Total:', result5.total);
  console.log('  All Zero Values:', result5.itemValue === 0 && result5.carryingCost === 0 && result5.assemblyCost === 0 && result5.extraHelperCost === 0);
  console.log('  Subtotal == Total:', result5.subtotal === result5.total);
  console.log('');

  console.log('=== SUMMARY ===');
  console.log('Test 1 - Basic Equality:', result1.subtotal === result1.total ? 'PASS' : 'FAIL');
  console.log('Test 2 - Student Discount Formula:', result2.total === (result2.subtotal - result2.studentDiscount) ? 'PASS' : 'FAIL');
  console.log('Test 3 - House Moving Multiplier:', result3.itemValue === 12 ? 'PASS' : 'FAIL');
  console.log('Test 4 - Complex Formula:', result4.total === expectedTotal4 ? 'PASS' : 'FAIL');
  console.log('Test 5 - Zero Values:', (result5.itemValue === 0 && result5.subtotal === result5.total) ? 'PASS' : 'FAIL');
  
  // Check for any floating point issues
  const precisionIssues = [
    Math.abs((result2.subtotal - result2.studentDiscount) - result2.total),
    Math.abs(expectedTotal4 - result4.total)
  ];
  
  const hasPrecisionIssues = precisionIssues.some(diff => diff > 0.001);
  console.log('Floating Point Precision Issues:', hasPrecisionIssues ? 'FAIL' : 'PASS');
  
  if (hasPrecisionIssues) {
    console.log('Precision Differences:', precisionIssues);
  }
  
  console.log('\n=== ANALYSIS COMPLETE ===');
  
  // Clean up
  await supabasePricingService.invalidateCache();
  process.exit(0);
}

runPricingTests().catch(console.error);
