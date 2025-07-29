// Test script for marketplace item details API endpoints
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000';

async function testMarketplaceItemDetails() {
  console.log('🧪 Testing Marketplace Item Details API...\n');

  try {
    // Test 1: Get all marketplace item details
    console.log('1️⃣ Testing GET /api/marketplace-item-details');
    const response1 = await fetch(`${API_BASE_URL}/api/marketplace-item-details`);
    const data1 = await response1.json();
    
    if (response1.ok) {
      console.log('✅ Success! Found', data1.data?.length || 0, 'marketplace item details');
      console.log('Sample data:', data1.data?.slice(0, 3));
    } else {
      console.log('❌ Failed:', data1.error);
    }

    // Test 2: Test specific category lookup
    console.log('\n2️⃣ Testing category lookup for "Sofa\'s and Chairs" with subcategory "Sofa"');
    const response2 = await fetch(`${API_BASE_URL}/api/marketplace-item-details`);
    const data2 = await response2.json();
    
    if (response2.ok) {
      const sofaItem = data2.data?.find(item => 
        item.category === "Sofa's and Chairs" && item.subcategory === "Sofa"
      );
      
      if (sofaItem) {
        console.log('✅ Found sofa item with', sofaItem.points, 'points');
      } else {
        console.log('❌ Sofa item not found');
      }
    }

    // Test 3: Test category without subcategory
    console.log('\n3️⃣ Testing category lookup for "Lamps" (no subcategory)');
    const response3 = await fetch(`${API_BASE_URL}/api/marketplace-item-details`);
    const data3 = await response3.json();
    
    if (response3.ok) {
      const lampItem = data3.data?.find(item => 
        item.category === "Lamps" && !item.subcategory
      );
      
      if (lampItem) {
        console.log('✅ Found lamp item with', lampItem.points, 'points');
      } else {
        console.log('❌ Lamp item not found');
      }
    }

    console.log('\n🎉 Marketplace Item Details API tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testMarketplaceItemDetails();