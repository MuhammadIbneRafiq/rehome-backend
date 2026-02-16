import supabasePricingService from './services/supabasePricingService.js';

/**
 * Test the new elevator carrying cost logic with actual database points
 * 
 * Using actual furniture item points from database:
 * 2-Person Bed: 5 points
 * 2-Person Mattress: 4 points  
 * 2-Doors Closet: 5 points
 * Chair: 2 points each (x2 = 4 points)
 * Box: 0.5 points each (x10 = 5 points)
 * 
 * Total: 5 + 4 + 5 + 4 + 5 = 23 points
 */

async function testElevatorLogic() {
  console.log('=== Testing Elevator Carrying Cost Logic (Actual Database Points) ===\n');
  
  // Load config
  const config = await supabasePricingService.getPricingConfig();
  
  // Test items with actual database points
  const items = [
    { id: 'f5f674a4-df3d-4e0e-8760-1ba8365e89d3', quantity: 1 }, // 2-Person Bed: 5 points
    { id: '518f2592-bf9c-40dc-9431-fe9d290b2256', quantity: 1 }, // 2-Person Mattress: 4 points
    { id: '0a1bd37c-e1c4-4155-bd8a-c7fc12656254', quantity: 1 }, // 2-Doors Closet: 5 points
    { id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', quantity: 2 }, // Chair: 2 points each = 4 total
    { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 10 } // Box: 0.5 points each = 5 total
  ];
  
  console.log('Test Items (with actual database points):');
  let totalPoints = 0;
  items.forEach(item => {
    const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
    const points = furnitureItem ? furnitureItem.points * item.quantity : 0;
    totalPoints += points;
    console.log(`  ${furnitureItem?.name || 'Unknown'} x${item.quantity} = ${points} points`);
  });
  console.log(`  TOTAL: ${totalPoints} points\n`);
  
  // Test 2nd floor
  console.log('--- 2nd Floor Test ---');
  
  // Stairs (no elevator)
  const stairsInput = {
    items,
    pickupFloors: 2,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };
  
  const stairsResult = supabasePricingService.calculateCarryingCost(stairsInput, config);
  console.log('Stairs Result:');
  console.log(`  Total Cost: €${stairsResult.totalCost.toFixed(2)}`);
  console.log(`  Floors: ${stairsResult.floors}`);
  console.log(`  Carrying Item Points: ${stairsResult.carryingItemPoints}`);
  console.log(`  Base Fee Applied: ${stairsResult.baseFeeApplied}`);
  
  // Manual calculation: 23 × 1.35 × 2 = 62.1 (no base fee since 23 > 20)
  console.log(`  Manual calculation: 23 × 1.35 × 2 = €62.10 (no base fee)`);
  
  // Elevator
  const elevatorInput = {
    items,
    pickupFloors: 2,
    dropoffFloors: 0,
    hasElevatorPickup: true,
    hasElevatorDropoff: true
  };
  
  const elevatorResult = supabasePricingService.calculateCarryingCost(elevatorInput, config);
  console.log('\nElevator Result:');
  console.log(`  Total Cost: €${elevatorResult.totalCost.toFixed(2)}`);
  console.log(`  Floors: ${elevatorResult.floors}`);
  console.log(`  Carrying Item Points: ${elevatorResult.carryingItemPoints}`);
  console.log(`  Base Fee Applied: ${elevatorResult.baseFeeApplied}`);
  
  // Manual calculation: 23 × 1.10 × 2 = 50.6 (no base fee since 23 > 20)
  console.log(`  Manual calculation: 23 × 1.10 × 2 = €50.60 (no base fee)`);
  
  // Test 4th floor
  console.log('\n--- 4th Floor Test ---');
  
  const stairsInput4th = {
    items,
    pickupFloors: 4,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };
  
  const stairsResult4th = supabasePricingService.calculateCarryingCost(stairsInput4th, config);
  console.log('Stairs Result (4th floor):');
  console.log(`  Total Cost: €${stairsResult4th.totalCost.toFixed(2)}`);
  console.log(`  Floors: ${stairsResult4th.floors}`);
  
  // Manual calculation: 23 × 1.35 × 4 = 124.2 (no base fee since 23 > 20)
  console.log(`  Manual calculation: 23 × 1.35 × 4 = €124.20 (no base fee)`);
  
  const elevatorInput4th = {
    items,
    pickupFloors: 4,
    dropoffFloors: 0,
    hasElevatorPickup: true,
    hasElevatorDropoff: true
  };
  
  const elevatorResult4th = supabasePricingService.calculateCarryingCost(elevatorInput4th, config);
  console.log('\nElevator Result (4th floor):');
  console.log(`  Total Cost: €${elevatorResult4th.totalCost.toFixed(2)}`);
  console.log(`  Floors: ${elevatorResult4th.floors}`);
  
  // Manual calculation: 23 × 1.10 × 4 = 101.2 (no base fee since 23 > 20)
  console.log(`  Manual calculation: 23 × 1.10 × 4 = €101.20 (no base fee)`);
  
  // Test base fee threshold
  console.log('\n--- Base Fee Threshold Test ---');
  console.log(`Carrying Item Points: ${elevatorResult.carryingItemPoints}`);
  console.log(`Threshold: 20 points`);
  console.log(`Base fee should NOT apply (23 > 20): ${!elevatorResult.baseFeeApplied}`);
  
  // Test with items below threshold (should apply base fee)
  console.log('\n--- Below Threshold Test (should apply base fee) ---');
  const smallItems = [
    { id: 'dd7e4197-677c-4ccb-8aa6-38ad40167899', quantity: 1 } // Just 1 chair = 2 points
  ];
  
  const smallInput = {
    items: smallItems,
    pickupFloors: 2,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };
  
  const smallResult = supabasePricingService.calculateCarryingCost(smallInput, config);
  console.log('Small items (1 chair = 2 points):');
  console.log(`  Total Cost: €${smallResult.totalCost.toFixed(2)}`);
  console.log(`  Carrying Item Points: ${smallResult.carryingItemPoints}`);
  console.log(`  Base Fee Applied: ${smallResult.baseFeeApplied}`);
  console.log(`  Manual: 2 × 1.35 × 2 + 25 = €30.70 (with base fee)`);
  
  // Test box exponential logic
  console.log('\n--- Box Exponential Logic Test ---');
  
  // Test with 15 boxes (should use 1.5 multiplier)
  const manyBoxes = [
    { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 15 } // 15 boxes = 7.5 points
  ];
  
  const boxesInput = {
    items: manyBoxes,
    pickupFloors: 2,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };
  
  const boxesResult = supabasePricingService.calculateCarryingCost(boxesInput, config);
  console.log('15 boxes (7.5 points, >10 threshold):');
  console.log(`  Total Cost: €${boxesResult.totalCost.toFixed(2)}`);
  console.log(`  Should use 1.5 multiplier: 7.5 × 1.5 × 2 + 25 = €47.50`);
  
  // Test with 5 boxes (should use 1.35 multiplier)
  const fewBoxes = [
    { id: 'fb6097cc-f129-43a5-9ad3-0fd7d782dc5e', quantity: 5 } // 5 boxes = 2.5 points
  ];
  
  const fewBoxesInput = {
    items: fewBoxes,
    pickupFloors: 2,
    dropoffFloors: 0,
    hasElevatorPickup: false,
    hasElevatorDropoff: false
  };
  
  const fewBoxesResult = supabasePricingService.calculateCarryingCost(fewBoxesInput, config);
  console.log('\n5 boxes (2.5 points, ≤10 threshold):');
  console.log(`  Total Cost: €${fewBoxesResult.totalCost.toFixed(2)}`);
  console.log(`  Should use 1.35 multiplier: 2.5 × 1.35 × 2 + 25 = €31.75`);
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testElevatorLogic().catch(console.error);
