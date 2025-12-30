/**
 * AUTOMATED BENCHMARK SUITE FOR SUPABASE RPC FUNCTIONS
 * 
 * This script runs automated performance benchmarks with timing assertions
 * to ensure RPC functions meet performance requirements.
 * 
 * Run: node benchmark-suite.js
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  FAST: 50,      // Very fast operations (cached, simple lookups)
  NORMAL: 200,   // Normal operations (single queries)
  SLOW: 500,     // Acceptable for complex operations
  CRITICAL: 1000 // Maximum acceptable latency
};

// Test results storage
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Utility functions
function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getPerformanceRating(duration, threshold) {
  if (duration <= threshold * 0.5) return '🟢 EXCELLENT';
  if (duration <= threshold) return '🟡 GOOD';
  if (duration <= threshold * 1.5) return '🟠 WARNING';
  return '🔴 FAILED';
}

async function benchmark(name, fn, threshold = THRESHOLDS.NORMAL, iterations = 10) {
  console.log(`\n📊 Testing: ${name}`);
  console.log(`   Threshold: ${formatDuration(threshold)} | Iterations: ${iterations}`);
  
  const durations = [];
  let errors = 0;

  // Warm-up run
  try {
    await fn();
  } catch (error) {
    console.log(`   ⚠️  Warm-up failed: ${error.message}`);
  }

  // Actual benchmark runs
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await fn();
      const duration = performance.now() - start;
      durations.push(duration);
    } catch (error) {
      errors++;
      console.log(`   ❌ Iteration ${i + 1} failed: ${error.message}`);
    }
  }

  if (durations.length === 0) {
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: 'All iterations failed' });
    console.log(`   ❌ FAILED - All iterations failed`);
    return;
  }

  // Calculate statistics
  const sorted = durations.sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // Determine pass/fail
  const rating = getPerformanceRating(p95, threshold);
  const passed = p95 <= threshold;
  const warning = p95 > threshold && p95 <= threshold * 1.5;

  if (passed) results.passed++;
  else if (warning) results.warnings++;
  else results.failed++;

  results.tests.push({
    name,
    status: passed ? 'PASSED' : warning ? 'WARNING' : 'FAILED',
    avg,
    min,
    max,
    p50,
    p95,
    p99,
    threshold,
    errors
  });

  // Output results
  console.log(`   ${rating}`);
  console.log(`   Min: ${formatDuration(min)} | Avg: ${formatDuration(avg)} | Max: ${formatDuration(max)}`);
  console.log(`   P50: ${formatDuration(p50)} | P95: ${formatDuration(p95)} | P99: ${formatDuration(p99)}`);
  if (errors > 0) {
    console.log(`   ⚠️  Errors: ${errors}/${iterations}`);
  }
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

async function runBenchmarks() {
  console.log('=================================================================');
  console.log('SUPABASE RPC PERFORMANCE BENCHMARK SUITE');
  console.log('=================================================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log('');

  // Test 1: get_city_schedule_status
  await benchmark(
    'get_city_schedule_status',
    async () => {
      const { data, error } = await supabase.rpc('get_city_schedule_status', {
        check_city: 'Amsterdam',
        check_date: new Date().toISOString().split('T')[0]
      });
      if (error) throw error;
    },
    THRESHOLDS.FAST,
    20
  );

  // Test 2: get_city_days_in_range
  await benchmark(
    'get_city_days_in_range (30 days)',
    async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      
      const { data, error } = await supabase.rpc('get_city_days_in_range', {
        check_city: 'Amsterdam',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });
      if (error) throw error;
    },
    THRESHOLDS.NORMAL,
    15
  );

  // Test 3: is_date_blocked
  await benchmark(
    'is_date_blocked',
    async () => {
      const { data, error } = await supabase.rpc('is_date_blocked', {
        check_date: new Date().toISOString().split('T')[0],
        city_name: 'Amsterdam'
      });
      if (error) throw error;
    },
    THRESHOLDS.FAST,
    20
  );

  // Test 4: get_pricing_config_cached
  await benchmark(
    'get_pricing_config_cached',
    async () => {
      const { data, error } = await supabase.rpc('get_pricing_config_cached');
      if (error) throw error;
    },
    THRESHOLDS.FAST,
    30
  );

  // Test 5: get_city_base_charges
  await benchmark(
    'get_city_base_charges',
    async () => {
      const { data, error } = await supabase.rpc('get_city_base_charges');
      if (error) throw error;
    },
    THRESHOLDS.FAST,
    30
  );

  // Test 6: get_furniture_items_with_points
  await benchmark(
    'get_furniture_items_with_points',
    async () => {
      const { data, error } = await supabase.rpc('get_furniture_items_with_points');
      if (error) throw error;
    },
    THRESHOLDS.NORMAL,
    20
  );

  // Test 7: get_batch_city_schedules
  await benchmark(
    'get_batch_city_schedules (5 cities, 7 days)',
    async () => {
      const cities = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven'];
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }
      
      const { data, error } = await supabase.rpc('get_batch_city_schedules', {
        cities,
        dates
      });
      if (error) throw error;
    },
    THRESHOLDS.NORMAL,
    15
  );

  // Test 8: calculate_distance_cost
  await benchmark(
    'calculate_distance_cost',
    async () => {
      const { data, error } = await supabase.rpc('calculate_distance_cost', {
        distance_km: 25
      });
      if (error) throw error;
    },
    THRESHOLDS.FAST,
    30
  );

  // Test 9: get_month_schedule
  await benchmark(
    'get_month_schedule (30 days)',
    async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      
      const { data, error } = await supabase.rpc('get_month_schedule', {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });
      if (error) throw error;
    },
    THRESHOLDS.NORMAL,
    15
  );

  // Test 10: get_month_schedule (90 days)
  await benchmark(
    'get_month_schedule (90 days)',
    async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 90);
      
      const { data, error } = await supabase.rpc('get_month_schedule', {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });
      if (error) throw error;
    },
    THRESHOLDS.SLOW,
    10
  );

  // Test 11: get_blocked_dates
  await benchmark(
    'get_blocked_dates (30 days)',
    async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      
      const { data, error } = await supabase.rpc('get_blocked_dates', {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        city_name: 'Amsterdam'
      });
      if (error) throw error;
    },
    THRESHOLDS.NORMAL,
    15
  );

  // Test 12: Complete pricing flow simulation
  await benchmark(
    'Complete Pricing Flow (all RPCs)',
    async () => {
      // Step 1: Load config
      await supabase.rpc('get_pricing_config_cached');
      await supabase.rpc('get_city_base_charges');
      await supabase.rpc('get_furniture_items_with_points');
      
      // Step 2: Check date
      const date = new Date().toISOString().split('T')[0];
      await supabase.rpc('is_date_blocked', { check_date: date, city_name: 'Amsterdam' });
      await supabase.rpc('get_city_schedule_status', { check_city: 'Amsterdam', check_date: date });
      
      // Step 3: Calculate distance
      await supabase.rpc('calculate_distance_cost', { distance_km: 25 });
    },
    THRESHOLDS.SLOW,
    10
  );

  // Print summary
  printSummary();
  
  // Export results
  await exportResults();
}

function printSummary() {
  console.log('\n\n=================================================================');
  console.log('BENCHMARK SUMMARY');
  console.log('=================================================================');
  console.log(`Total Tests: ${results.passed + results.warnings + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('');

  if (results.failed > 0) {
    console.log('Failed Tests:');
    results.tests
      .filter(t => t.status === 'FAILED')
      .forEach(t => {
        console.log(`  - ${t.name}: P95 ${formatDuration(t.p95)} (threshold: ${formatDuration(t.threshold)})`);
      });
    console.log('');
  }

  if (results.warnings > 0) {
    console.log('Warning Tests:');
    results.tests
      .filter(t => t.status === 'WARNING')
      .forEach(t => {
        console.log(`  - ${t.name}: P95 ${formatDuration(t.p95)} (threshold: ${formatDuration(t.threshold)})`);
      });
    console.log('');
  }

  console.log('Performance Recommendations:');
  if (results.failed > 0) {
    console.log('  🔴 CRITICAL: Some functions exceed performance thresholds');
    console.log('     - Review EXPLAIN ANALYZE output in SQL profiling');
    console.log('     - Check for missing indexes');
    console.log('     - Consider query optimization');
  } else if (results.warnings > 0) {
    console.log('  🟡 MODERATE: Some functions are approaching thresholds');
    console.log('     - Monitor these functions under load');
    console.log('     - Consider preemptive optimization');
  } else {
    console.log('  🟢 EXCELLENT: All functions meet performance requirements');
    console.log('     - Continue monitoring in production');
  }
  console.log('');
  console.log(`End Time: ${new Date().toISOString()}`);
  console.log('=================================================================');
}

async function exportResults() {
  const fs = await import('fs/promises');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-results-${timestamp}.json`;
  
  const report = {
    timestamp: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    summary: {
      total: results.passed + results.warnings + results.failed,
      passed: results.passed,
      warnings: results.warnings,
      failed: results.failed
    },
    thresholds: THRESHOLDS,
    tests: results.tests
  };

  await fs.writeFile(filename, JSON.stringify(report, null, 2));
  console.log(`\n📄 Results exported to: ${filename}`);
}

// Run benchmarks
runBenchmarks().catch(error => {
  console.error('Benchmark suite failed:', error);
  process.exit(1);
});
