/**
 * K6 LOAD TEST FOR SUPABASE RPC FUNCTIONS
 * 
 * This script simulates concurrent users calling RPC functions
 * to measure performance under load.
 * 
 * Install k6: https://k6.io/docs/getting-started/installation/
 * 
 * Run tests:
 * k6 run rpc-load-test.js
 * k6 run --vus 10 --duration 30s rpc-load-test.js
 * k6 run --vus 50 --duration 2m rpc-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const rpcErrors = new Rate('rpc_errors');
const rpcDuration = new Trend('rpc_duration');
const rpcCalls = new Counter('rpc_calls');

// Configuration - UPDATE THESE VALUES
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = __ENV.SUPABASE_KEY || 'your-anon-key';

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 25 },  // Ramp up to 25 users
    { duration: '1m', target: 25 },   // Stay at 25 users
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    'rpc_errors': ['rate<0.05'], // Error rate under 5%
    'http_req_failed': ['rate<0.05'], // Failed requests under 5%
  },
};

// Helper function to call Supabase RPC
function callRPC(functionName, params = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  
  const payload = JSON.stringify(params);
  
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  const startTime = Date.now();
  const response = http.post(url, payload, { headers });
  const duration = Date.now() - startTime;

  rpcDuration.add(duration);
  rpcCalls.add(1);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
    'has valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });

  rpcErrors.add(!success);

  return response;
}

// Test scenarios
export default function () {
  const scenarios = [
    testCityScheduleStatus,
    testCityDaysInRange,
    testIsDateBlocked,
    testPricingConfig,
    testCityBaseCharges,
    testFurnitureItems,
    testBatchCitySchedules,
    testMonthSchedule,
    testDistanceCost,
  ];

  // Randomly select a scenario to simulate real user behavior
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  // Random sleep between 1-3 seconds to simulate user think time
  sleep(Math.random() * 2 + 1);
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function testCityScheduleStatus() {
  const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const daysAhead = Math.floor(Math.random() * 30);
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  
  callRPC('get_city_schedule_status', {
    check_city: city,
    check_date: date.toISOString().split('T')[0],
  });
}

function testCityDaysInRange() {
  const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  
  callRPC('get_city_days_in_range', {
    check_city: city,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  });
}

function testIsDateBlocked() {
  const daysAhead = Math.floor(Math.random() * 30);
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  
  const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven', null];
  const city = cities[Math.floor(Math.random() * cities.length)];
  
  callRPC('is_date_blocked', {
    check_date: date.toISOString().split('T')[0],
    city_name: city,
  });
}

function testPricingConfig() {
  callRPC('get_pricing_config_cached', {});
}

function testCityBaseCharges() {
  callRPC('get_city_base_charges', {});
}

function testFurnitureItems() {
  callRPC('get_furniture_items_with_points', {});
}

function testBatchCitySchedules() {
  const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'];
  const dates = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  callRPC('get_batch_city_schedules', {
    cities: cities,
    dates: dates,
  });
}

function testMonthSchedule() {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  
  callRPC('get_month_schedule', {
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  });
}

function testDistanceCost() {
  const distances = [5, 15, 25, 45, 75, 100];
  const distance = distances[Math.floor(Math.random() * distances.length)];
  
  callRPC('calculate_distance_cost', {
    distance_km: distance,
  });
}

// ============================================================================
// SETUP AND TEARDOWN
// ============================================================================

export function setup() {
  console.log('=================================================================');
  console.log('STARTING K6 LOAD TEST FOR SUPABASE RPC FUNCTIONS');
  console.log('=================================================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('Test will simulate realistic user traffic patterns');
  console.log('');
  
  // Verify connection
  const response = callRPC('get_pricing_config_cached', {});
  if (response.status !== 200) {
    console.error('Failed to connect to Supabase. Check your URL and API key.');
    throw new Error('Setup failed');
  }
  
  console.log('Connection verified. Starting load test...');
  console.log('');
}

export function teardown(data) {
  console.log('');
  console.log('=================================================================');
  console.log('LOAD TEST COMPLETE');
  console.log('=================================================================');
  console.log('Review the metrics above for:');
  console.log('- http_req_duration: Response time percentiles');
  console.log('- rpc_errors: Error rate during load');
  console.log('- rpc_calls: Total RPC function calls made');
  console.log('- http_req_failed: Failed request rate');
  console.log('');
  console.log('Thresholds:');
  console.log('- P95 should be < 500ms');
  console.log('- P99 should be < 1000ms');
  console.log('- Error rate should be < 5%');
  console.log('');
}

// ============================================================================
// CUSTOM SUMMARY
// ============================================================================

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'performance-results.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n';
  summary += indent + '=================================================================\n';
  summary += indent + 'LOAD TEST SUMMARY\n';
  summary += indent + '=================================================================\n\n';
  
  // Request metrics
  summary += indent + 'HTTP Requests:\n';
  summary += indent + `  Total: ${data.metrics.http_reqs.values.count}\n`;
  summary += indent + `  Failed: ${data.metrics.http_req_failed.values.rate * 100}%\n`;
  summary += indent + `  Duration (avg): ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += indent + `  Duration (p95): ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Duration (p99): ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  
  // RPC metrics
  summary += indent + 'RPC Calls:\n';
  summary += indent + `  Total: ${data.metrics.rpc_calls.values.count}\n`;
  summary += indent + `  Error Rate: ${(data.metrics.rpc_errors.values.rate * 100).toFixed(2)}%\n`;
  summary += indent + `  Duration (avg): ${data.metrics.rpc_duration.values.avg.toFixed(2)}ms\n`;
  summary += indent + `  Duration (p95): ${data.metrics.rpc_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Duration (p99): ${data.metrics.rpc_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  
  // Virtual users
  summary += indent + 'Virtual Users:\n';
  summary += indent + `  Max: ${data.metrics.vus_max.values.max}\n\n`;
  
  // Thresholds
  summary += indent + 'Threshold Results:\n';
  Object.keys(data.thresholds).forEach(threshold => {
    const passed = data.thresholds[threshold].ok;
    const status = passed ? '✓ PASS' : '✗ FAIL';
    summary += indent + `  ${threshold}: ${status}\n`;
  });
  
  summary += '\n';
  summary += indent + '=================================================================\n';
  
  return summary;
}
