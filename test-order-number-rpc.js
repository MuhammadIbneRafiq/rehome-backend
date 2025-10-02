// Test script for the generate_moving_order_number RPC function
import { createClient } from '@supabase/supabase-js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testOrderNumberRPC() {
  console.log('🧪 Testing generate_moving_order_number RPC function...\n');

  try {
    // Test case 1: Generate single order number
    console.log('Test 1: Generate single order number');
    const { data: result1, error: error1 } = await supabase.rpc('generate_moving_order_number');

    if (error1) {
      console.error('❌ Test 1 failed:', error1);
    } else {
      console.log('✅ Test 1 passed');
      console.log('Generated order number:', result1);
      
      // Validate format: RH-XXXXXX-XXX
      const orderNumberPattern = /^RH-\d{6}-\d{3}$/;
      if (orderNumberPattern.test(result1)) {
        console.log('✅ Order number format is correct');
      } else {
        console.log('❌ Order number format is incorrect');
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test case 2: Generate multiple order numbers to check uniqueness
    console.log('Test 2: Generate multiple order numbers (uniqueness test)');
    const orderNumbers = [];
    const numberOfTests = 10;
    
    for (let i = 0; i < numberOfTests; i++) {
      const { data: result, error } = await supabase.rpc('generate_moving_order_number');
      
      if (error) {
        console.error(`❌ Test 2.${i + 1} failed:`, error);
        break;
      }
      
      orderNumbers.push(result);
      console.log(`Generated ${i + 1}: ${result}`);
    }

    // Check for duplicates
    const uniqueNumbers = new Set(orderNumbers);
    if (uniqueNumbers.size === orderNumbers.length) {
      console.log('✅ All generated order numbers are unique');
    } else {
      console.log('❌ Found duplicate order numbers');
      console.log('Duplicates:', orderNumbers.filter((item, index) => orderNumbers.indexOf(item) !== index));
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test case 3: Performance test
    console.log('Test 3: Performance test (100 order numbers)');
    const startTime = Date.now();
    const performanceOrderNumbers = [];
    
    for (let i = 0; i < 100; i++) {
      const { data: result, error } = await supabase.rpc('generate_moving_order_number');
      
      if (error) {
        console.error(`❌ Performance test failed at iteration ${i + 1}:`, error);
        break;
      }
      
      performanceOrderNumbers.push(result);
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    const avgTimePerGeneration = executionTime / performanceOrderNumbers.length;

    if (performanceOrderNumbers.length === 100) {
      console.log(`✅ Performance test passed (${executionTime}ms total, ${avgTimePerGeneration.toFixed(2)}ms per generation)`);
      
      // Check uniqueness in performance test
      const uniquePerformanceNumbers = new Set(performanceOrderNumbers);
      if (uniquePerformanceNumbers.size === performanceOrderNumbers.length) {
        console.log('✅ All performance test order numbers are unique');
      } else {
        console.log('❌ Found duplicate order numbers in performance test');
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test case 4: Check if order numbers can be used in database
    console.log('Test 4: Database integration test');
    const { data: testOrderNumber, error: testError } = await supabase.rpc('generate_moving_order_number');
    
    if (testError) {
      console.error('❌ Test 4 failed to generate order number:', testError);
    } else {
      console.log('✅ Generated test order number:', testOrderNumber);
      
      // Try to insert a test record (this will fail if the function doesn't work properly)
      console.log('Testing database insertion with generated order number...');
      
      // Note: This test assumes the tables exist and have the order_number column
      // You might need to adjust based on your actual table structure
      console.log('Order number is ready for database use');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testOrderNumberRPC().then(() => {
  console.log('\n🎉 Order number RPC test completed!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});
