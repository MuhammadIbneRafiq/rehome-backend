// Test script for dynamic pricing multipliers API endpoint
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000';

async function testDynamicPricing() {
  console.log('🧪 Testing Dynamic Pricing Multipliers API...\n');

  try {
    // Test 1: Get dynamic pricing multipliers
    console.log('1️⃣ Testing GET /api/marketplace-pricing-multipliers');
    const response1 = await fetch(`${API_BASE_URL}/api/marketplace-pricing-multipliers`);
    const data1 = await response1.json();
    
    if (response1.ok) {
      console.log('✅ Success! Dynamic pricing multipliers fetched');
      console.log('📊 Points Info:', data1.data.points);
      console.log('💰 Carrying Multipliers:', data1.data.carrying);
      console.log('🔧 Assembly Multipliers:', data1.data.assembly);
      
      // Test calculations
      const { carrying, assembly, points } = data1.data;
      
      console.log('\n📈 Sample Calculations:');
      console.log(`- Low points carrying cost: €${carrying.lowPoints.cost}`);
      console.log(`- High points carrying cost: €${carrying.highPoints.cost}`);
      console.log(`- Low points assembly cost: €${assembly.lowPoints.cost}`);
      console.log(`- High points assembly cost: €${assembly.highPoints.cost}`);
      console.log(`- Threshold for high points: ${points.threshold}`);
      
    } else {
      console.log('❌ Failed:', data1.error);
    }

    // Test 2: Verify multipliers are calculated correctly
    console.log('\n2️⃣ Testing multiplier calculations...');
    const response2 = await fetch(`${API_BASE_URL}/api/marketplace-item-details`);
    const data2 = await response2.json();
    
    if (response2.ok) {
      const itemDetails = data2.data;
      const maxPoints = Math.max(...itemDetails.map(item => item.points));
      const minPoints = Math.min(...itemDetails.map(item => item.points));
      const avgPoints = itemDetails.reduce((sum, item) => sum + item.points, 0) / itemDetails.length;
      
      console.log('✅ Item details analysis:');
      console.log(`- Min points: ${minPoints}`);
      console.log(`- Max points: ${maxPoints}`);
      console.log(`- Average points: ${avgPoints.toFixed(1)}`);
      console.log(`- Total items: ${itemDetails.length}`);
      
      // Show some sample items with their points
      console.log('\n📋 Sample items with points:');
      itemDetails.slice(0, 5).forEach(item => {
        console.log(`- ${item.category}${item.subcategory ? ` > ${item.subcategory}` : ''}: ${item.points} points`);
      });
    }

    console.log('\n🎉 Dynamic Pricing API tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testDynamicPricing();