import { supabaseClient } from './db/params.js';
import { getCityScheduleStatusCached, warmUpCache, getCacheStats } from './services/cacheService.js';
import pricingService from './services/pricingService.js';

console.log('🔍 Testing ReHome Optimization Setup...\n');

async function testSetup() {
  let testsPass = true;
  
  // Test 1: Supabase Connection
  console.log('1️⃣  Testing Supabase connection...');
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      testsPass = false;
    } else {
      console.log('✅ Supabase connection successful');
    }
  } catch (err) {
    console.error('❌ Supabase connection error:', err.message);
    testsPass = false;
  }

  // Test 2: Check if required tables exist
  console.log('\n2️⃣  Checking required tables...');
  const requiredTables = ['city_schedule', 'city_prices', 'furniture_items', 'pricing_config'];
  
  for (const table of requiredTables) {
    try {
      const { count, error } = await supabaseClient
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.error(`❌ Table '${table}' missing or inaccessible:`, error.message);
        console.log(`   Run: sql/create-required-tables.sql`);
        testsPass = false;
      } else {
        console.log(`✅ Table '${table}' exists (${count || 0} records)`);
      }
    } catch (err) {
      console.error(`❌ Error checking table '${table}':`, err.message);
      testsPass = false;
    }
  }

  // Test 3: Check RPC Functions
  console.log('\n3️⃣  Testing RPC functions...');
  try {
    const testDate = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseClient.rpc('get_city_schedule_status', {
      check_city: 'Amsterdam',
      check_date: testDate
    });
    
    if (error) {
      console.error('❌ RPC function not found:', error.message);
      console.log('   Run: sql/supabase-rpc-functions.sql');
      testsPass = false;
    } else {
      console.log('✅ RPC functions installed');
      console.log('   Sample response:', data);
    }
  } catch (err) {
    console.error('❌ RPC function error:', err.message);
    testsPass = false;
  }

  // Test 4: Cache Service
  console.log('\n4️⃣  Testing cache service...');
  try {
    const testDate = new Date().toISOString().split('T')[0];
    const result = await getCityScheduleStatusCached('Amsterdam', testDate);
    console.log('✅ Cache service working');
    console.log('   Cached result:', result);
    
    const stats = getCacheStats();
    console.log('   Cache stats:', {
      hits: stats.hits,
      misses: stats.misses,
      keys: stats.cityScheduleKeys
    });
  } catch (err) {
    console.error('❌ Cache service error:', err.message);
    testsPass = false;
  }

  // Test 5: Pricing Service
  console.log('\n5️⃣  Testing pricing service...');
  try {
    await pricingService.initialize();
    
    const testInput = {
      serviceType: 'house-moving',
      pickupLocation: 'Amsterdam',
      dropoffLocation: 'Rotterdam',
      distanceKm: 60,
      selectedDate: new Date().toISOString().split('T')[0],
      isDateFlexible: false,
      itemQuantities: { 'sofa': 1, 'chair': 2 },
      floorPickup: 0,
      floorDropoff: 0,
      elevatorPickup: true,
      elevatorDropoff: true,
      assemblyItems: {},
      extraHelperItems: {},
      isStudent: false,
      hasStudentId: false
    };
    
    const result = await pricingService.calculatePricing(testInput);
    console.log('✅ Pricing service working');
    console.log('   Total price:', result.total);
    console.log('   Base price:', result.basePrice);
    console.log('   Distance cost:', result.distanceCost);
  } catch (err) {
    console.error('❌ Pricing service error:', err.message);
    testsPass = false;
  }

  // Test 6: API Endpoint
  console.log('\n6️⃣  Testing API endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/pricing/health');
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API endpoint accessible');
      console.log('   Health status:', data);
    } else {
      console.error('❌ API endpoint not responding');
      console.log('   Make sure server is running: npm run dev');
      testsPass = false;
    }
  } catch (err) {
    console.error('❌ API endpoint unreachable:', err.message);
    console.log('   Make sure server is running: npm run dev');
    testsPass = false;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (testsPass) {
    console.log('✅ ALL TESTS PASSED - System is ready!');
    console.log('\nNext steps:');
    console.log('1. Warm up cache: await warmUpCache()');
    console.log('2. Monitor performance: /api/pricing/cache-stats');
  } else {
    console.log('❌ SOME TESTS FAILED - Please fix the issues above');
    console.log('\nSetup checklist:');
    console.log('1. Run sql/create-required-tables.sql in Supabase');
    console.log('2. Run sql/supabase-rpc-functions.sql in Supabase');
    console.log('3. Ensure .env has correct Supabase credentials');
    console.log('4. Start server: npm run dev');
  }
}

// Run tests
testSetup().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
