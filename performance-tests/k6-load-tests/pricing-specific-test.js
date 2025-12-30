/**
 * K6 LOAD TEST - ITEM MOVING PRICING FLOW
 * 
 * This test simulates the complete user journey for item moving pricing,
 * testing all RPC functions involved in the pricing calculation flow.
 * 
 * Run: k6 run pricing-specific-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const pricingFlowErrors = new Rate('pricing_flow_errors');
const pricingFlowDuration = new Trend('pricing_flow_duration');
const pricingFlowComplete = new Counter('pricing_flow_complete');

// Configuration
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = __ENV.SUPABASE_KEY || 'your-anon-key';

export const options = {
  scenarios: {
    // Simulate normal user traffic
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },   // Ramp up
        { duration: '3m', target: 5 },   // Steady state
        { duration: '1m', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '30s',
    },
    // Simulate peak traffic (e.g., marketing campaign)
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },  // Ramp up to peak
        { duration: '5m', target: 20 },  // Sustained peak
        { duration: '2m', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '30s',
      startTime: '6m', // Start after normal_load
    },
    // Stress test - find breaking point
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },  // Ramp to high load
        { duration: '3m', target: 50 },  // Hold
        { duration: '2m', target: 100 }, // Push harder
        { duration: '2m', target: 100 }, // Hold
        { duration: '2m', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '30s',
      startTime: '15m', // Start after peak_load
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
    'pricing_flow_duration': ['p(95)<2000', 'p(99)<3000'],
    'pricing_flow_errors': ['rate<0.05'],
    'http_req_failed': ['rate<0.05'],
  },
};

function callRPC(functionName, params = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  const payload = JSON.stringify(params);
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  return http.post(url, payload, { headers, tags: { name: functionName } });
}

export default function () {
  const flowStartTime = Date.now();
  let flowSuccess = true;

  // Simulate complete item moving pricing flow
  group('Item Moving Pricing Flow', function () {
    
    // Step 1: Load initial configuration data (happens on page load)
    group('1. Load Configuration', function () {
      const pricingConfig = callRPC('get_pricing_config_cached', {});
      flowSuccess = flowSuccess && check(pricingConfig, {
        'pricing config loaded': (r) => r.status === 200,
      });

      const cityCharges = callRPC('get_city_base_charges', {});
      flowSuccess = flowSuccess && check(cityCharges, {
        'city charges loaded': (r) => r.status === 200,
      });

      const furnitureItems = callRPC('get_furniture_items_with_points', {});
      flowSuccess = flowSuccess && check(furnitureItems, {
        'furniture items loaded': (r) => r.status === 200,
      });
    });

    sleep(0.5); // User reads the page

    // Step 2: User selects date - check schedule
    group('2. Date Selection', function () {
      const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'];
      const city = cities[Math.floor(Math.random() * cities.length)];
      const daysAhead = Math.floor(Math.random() * 30) + 1;
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      const dateStr = date.toISOString().split('T')[0];

      // Check if date is blocked
      const blockedCheck = callRPC('is_date_blocked', {
        check_date: dateStr,
        city_name: city,
      });
      flowSuccess = flowSuccess && check(blockedCheck, {
        'date block check': (r) => r.status === 200,
      });

      // Check city schedule status
      const scheduleStatus = callRPC('get_city_schedule_status', {
        check_city: city,
        check_date: dateStr,
      });
      flowSuccess = flowSuccess && check(scheduleStatus, {
        'schedule status check': (r) => r.status === 200,
      });
    });

    sleep(1); // User thinks about date

    // Step 3: Load month calendar view
    group('3. Calendar View', function () {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const monthSchedule = callRPC('get_month_schedule', {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });
      flowSuccess = flowSuccess && check(monthSchedule, {
        'month schedule loaded': (r) => r.status === 200,
      });
    });

    sleep(0.5);

    // Step 4: Calculate distance cost
    group('4. Distance Calculation', function () {
      const distances = [5, 15, 25, 45, 75];
      const distance = distances[Math.floor(Math.random() * distances.length)];

      const distanceCost = callRPC('calculate_distance_cost', {
        distance_km: distance,
      });
      flowSuccess = flowSuccess && check(distanceCost, {
        'distance cost calculated': (r) => r.status === 200,
      });
    });

    sleep(2); // User adds items

    // Step 5: Batch check for flexible date range
    group('5. Flexible Date Range Check', function () {
      const cities = ['Amsterdam', 'Rotterdam', 'Utrecht'];
      const dates = [];
      
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }

      const batchSchedules = callRPC('get_batch_city_schedules', {
        cities: cities,
        dates: dates,
      });
      flowSuccess = flowSuccess && check(batchSchedules, {
        'batch schedules loaded': (r) => r.status === 200,
      });
    });

    sleep(1);

    // Step 6: Final price calculation (re-fetch to ensure fresh data)
    group('6. Final Price Calculation', function () {
      const pricingConfig = callRPC('get_pricing_config_cached', {});
      flowSuccess = flowSuccess && check(pricingConfig, {
        'final pricing config': (r) => r.status === 200,
      });
    });
  });

  const flowDuration = Date.now() - flowStartTime;
  pricingFlowDuration.add(flowDuration);
  pricingFlowErrors.add(!flowSuccess);
  
  if (flowSuccess) {
    pricingFlowComplete.add(1);
  }

  // User think time before next action
  sleep(Math.random() * 3 + 2);
}

export function setup() {
  console.log('=================================================================');
  console.log('ITEM MOVING PRICING FLOW LOAD TEST');
  console.log('=================================================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');
  console.log('Test Scenarios:');
  console.log('1. Normal Load: 5 concurrent users for 3 minutes');
  console.log('2. Peak Load: 20 concurrent users for 5 minutes');
  console.log('3. Stress Test: Up to 100 concurrent users');
  console.log('');
  
  // Verify connection
  const url = `${SUPABASE_URL}/rest/v1/rpc/get_pricing_config_cached`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
  const response = http.post(url, '{}', { headers });
  
  if (response.status !== 200) {
    console.error('Failed to connect to Supabase');
    throw new Error('Setup failed');
  }
  
  console.log('Connection verified. Starting test...');
  console.log('');
}

export function teardown(data) {
  console.log('');
  console.log('=================================================================');
  console.log('PRICING FLOW LOAD TEST COMPLETE');
  console.log('=================================================================');
  console.log('');
  console.log('Key Findings:');
  console.log('- Check pricing_flow_duration for end-to-end latency');
  console.log('- Review http_req_duration for individual RPC performance');
  console.log('- Examine pricing_flow_errors for failure rate');
  console.log('');
}
