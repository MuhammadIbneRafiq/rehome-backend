/**
 * Test cases for transport API endpoint
 * Tests the fix for double JSON parsing bug
 */

const FormData = require('form-data');
const fetch = require('node-fetch');

const API_URL = 'https://rehome-backend.vercel.app/api/transport';

// Test data
const mockPickupLocation = {
  placeId: 'ChIJVXealLU_xkcRja_At0z9AGY',
  formattedAddress: 'Amsterdam, Netherlands',
  displayName: 'Amsterdam',
  text: 'Amsterdam',
  city: 'Amsterdam',
  countryCode: 'NL',
  countryName: 'Netherlands',
  coordinates: {
    lat: 52.3676,
    lng: 4.9041
  }
};

const mockDropoffLocation = {
  placeId: 'ChIJ__8_hziD0UcR_0prRKfXfVs',
  formattedAddress: 'Eindhoven, Netherlands',
  displayName: 'Eindhoven',
  text: 'Eindhoven',
  city: 'Eindhoven',
  countryCode: 'NL',
  countryName: 'Netherlands',
  coordinates: {
    lat: 51.4416,
    lng: 5.4697
  }
};

const mockItems = [
  {
    id: 'small-fridge',
    name: 'Small Fridge/Freezer',
    quantity: 1,
    points: 5
  }
];

/**
 * Test Case 1: Valid transport request with all required fields
 */
async function testValidTransportRequest() {
  console.log('\n=== Test 1: Valid Transport Request ===');
  
  const formData = new FormData();
  formData.append('customerName', 'Test User');
  formData.append('email', 'test@example.com');
  formData.append('phone', '+31612345678');
  formData.append('serviceType', 'item-transport');
  formData.append('pickupLocation', JSON.stringify(mockPickupLocation));
  formData.append('dropoffLocation', JSON.stringify(mockDropoffLocation));
  formData.append('pickupFloors', '2');
  formData.append('dropoffFloors', '1');
  formData.append('hasElevatorPickup', 'false');
  formData.append('hasElevatorDropoff', 'true');
  formData.append('items', JSON.stringify(mockItems));
  formData.append('hasStudentId', 'false');
  formData.append('needsAssembly', 'false');
  formData.append('needsExtraHelper', 'false');
  formData.append('selectedDate', new Date().toISOString());
  formData.append('specialInstructions', 'Test instructions');

  try {
    const response = await fetch(`${API_URL}/create`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.status === 200 && data.success) {
      console.log('✅ Test PASSED: Transport request created successfully');
      return true;
    } else {
      console.log('❌ Test FAILED: Expected success but got error');
      console.log('Error details:', data.error, data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Test FAILED with exception:', error.message);
    return false;
  }
}

/**
 * Test Case 2: Transport request with nested location objects (edge case)
 */
async function testNestedLocationObjects() {
  console.log('\n=== Test 2: Nested Location Objects ===');
  
  const complexLocation = {
    ...mockPickupLocation,
    metadata: {
      source: 'google-places',
      timestamp: new Date().toISOString()
    }
  };

  const formData = new FormData();
  formData.append('customerName', 'Test User 2');
  formData.append('email', 'test2@example.com');
  formData.append('phone', '+31612345679');
  formData.append('serviceType', 'item-transport');
  formData.append('pickupLocation', JSON.stringify(complexLocation));
  formData.append('dropoffLocation', JSON.stringify(mockDropoffLocation));
  formData.append('pickupFloors', '0');
  formData.append('dropoffFloors', '0');
  formData.append('hasElevatorPickup', 'false');
  formData.append('hasElevatorDropoff', 'false');
  formData.append('items', JSON.stringify(mockItems));
  formData.append('hasStudentId', 'false');
  formData.append('needsAssembly', 'false');
  formData.append('needsExtraHelper', 'false');
  formData.append('selectedDate', new Date().toISOString());
  formData.append('specialInstructions', '');

  try {
    const response = await fetch(`${API_URL}/create`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    
    if (response.status === 200 && data.success) {
      console.log('✅ Test PASSED: Handled nested objects correctly');
      return true;
    } else {
      console.log('❌ Test FAILED: Could not handle nested location objects');
      console.log('Error:', data.error, data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Test FAILED with exception:', error.message);
    return false;
  }
}

/**
 * Test Case 3: Transport request with student discount
 */
async function testStudentDiscount() {
  console.log('\n=== Test 3: Student Discount Request ===');
  
  const formData = new FormData();
  formData.append('customerName', 'Student User');
  formData.append('email', 'student@university.nl');
  formData.append('phone', '+31612345680');
  formData.append('serviceType', 'item-transport');
  formData.append('pickupLocation', JSON.stringify(mockPickupLocation));
  formData.append('dropoffLocation', JSON.stringify(mockDropoffLocation));
  formData.append('pickupFloors', '1');
  formData.append('dropoffFloors', '1');
  formData.append('hasElevatorPickup', 'true');
  formData.append('hasElevatorDropoff', 'true');
  formData.append('items', JSON.stringify(mockItems));
  formData.append('hasStudentId', 'true');
  formData.append('needsAssembly', 'false');
  formData.append('needsExtraHelper', 'false');
  formData.append('selectedDate', new Date().toISOString());
  formData.append('specialInstructions', 'Student discount test');

  try {
    const response = await fetch(`${API_URL}/create`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    
    if (response.status === 200 && data.success) {
      console.log('✅ Test PASSED: Student discount request processed');
      if (data.data.pricing && data.data.pricing.studentDiscount > 0) {
        console.log('✅ Student discount applied:', data.data.pricing.studentDiscount);
      }
      return true;
    } else {
      console.log('❌ Test FAILED: Student discount request failed');
      console.log('Error:', data.error, data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Test FAILED with exception:', error.message);
    return false;
  }
}

/**
 * Test Case 4: Invalid location data (should fail gracefully)
 */
async function testInvalidLocationData() {
  console.log('\n=== Test 4: Invalid Location Data (Should Fail Gracefully) ===');
  
  const formData = new FormData();
  formData.append('customerName', 'Test User');
  formData.append('email', 'test@example.com');
  formData.append('phone', '+31612345678');
  formData.append('serviceType', 'item-transport');
  formData.append('pickupLocation', 'invalid-json-{{{');
  formData.append('dropoffLocation', JSON.stringify(mockDropoffLocation));
  formData.append('pickupFloors', '0');
  formData.append('dropoffFloors', '0');
  formData.append('hasElevatorPickup', 'false');
  formData.append('hasElevatorDropoff', 'false');
  formData.append('items', JSON.stringify(mockItems));
  formData.append('hasStudentId', 'false');
  formData.append('needsAssembly', 'false');
  formData.append('needsExtraHelper', 'false');
  formData.append('selectedDate', new Date().toISOString());

  try {
    const response = await fetch(`${API_URL}/create`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    
    if (response.status === 500 && !data.success) {
      console.log('✅ Test PASSED: Invalid data handled gracefully with proper error');
      console.log('Error message:', data.message);
      return true;
    } else if (response.status === 200) {
      console.log('⚠️  Test WARNING: Invalid data was accepted (should have failed)');
      return false;
    } else {
      console.log('❌ Test FAILED: Unexpected response');
      return false;
    }
  } catch (error) {
    console.log('✅ Test PASSED: Exception caught for invalid data');
    return true;
  }
}

/**
 * Test Case 5: Calculate pricing endpoint
 */
async function testCalculatePricing() {
  console.log('\n=== Test 5: Calculate Pricing Endpoint ===');
  
  const pricingInput = {
    serviceType: 'item-transport',
    pickupLocation: mockPickupLocation,
    dropoffLocation: mockDropoffLocation,
    selectedDate: new Date().toISOString(),
    items: mockItems,
    hasStudentId: false,
    needsAssembly: false,
    needsExtraHelper: false,
    pickupFloors: 2,
    dropoffFloors: 1,
    hasElevatorPickup: false,
    hasElevatorDropoff: true,
    daysUntilMove: 7
  };

  try {
    const response = await fetch(`${API_URL}/calculate-price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pricingInput)
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Pricing:', JSON.stringify(data.data, null, 2));
    
    if (response.status === 200 && data.success && data.data.total > 0) {
      console.log('✅ Test PASSED: Pricing calculated successfully');
      console.log('Total price:', data.data.total);
      return true;
    } else {
      console.log('❌ Test FAILED: Pricing calculation failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Test FAILED with exception:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Transport API Test Suite                            ║');
  console.log('║   Testing fix for double JSON parsing bug             ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  const results = [];
  
  results.push(await testValidTransportRequest());
  results.push(await testNestedLocationObjects());
  results.push(await testStudentDiscount());
  results.push(await testInvalidLocationData());
  results.push(await testCalculatePricing());
  
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Test Results Summary                                 ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\nTotal Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n✅ ALL TESTS PASSED! The fix is working correctly.');
  } else {
    console.log('\n❌ SOME TESTS FAILED. Please review the errors above.');
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testValidTransportRequest,
  testNestedLocationObjects,
  testStudentDiscount,
  testInvalidLocationData,
  testCalculatePricing,
  runAllTests
};
