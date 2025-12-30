/**
 * REAL-TIME PERFORMANCE MONITOR
 * 
 * Continuously monitors RPC performance and alerts on issues
 * Run: node real-time-monitor.js
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import PerformanceLogger from './performance-logger.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const logger = new PerformanceLogger(SUPABASE_URL, SUPABASE_KEY);

// Configuration
const MONITOR_INTERVAL_MS = 60000; // Check every minute
const ALERT_THRESHOLDS = {
  p95: 500,           // P95 latency threshold (ms)
  avgDuration: 250,   // Average duration threshold (ms)
  successRate: 95,    // Minimum success rate (%)
  errorRate: 5        // Maximum error rate (%)
};

const RPC_FUNCTIONS = [
  'get_city_schedule_status',
  'get_city_days_in_range',
  'is_date_blocked',
  'get_pricing_config_cached',
  'get_city_base_charges',
  'get_furniture_items_with_points',
  'get_batch_city_schedules',
  'calculate_distance_cost',
  'get_month_schedule',
  'get_blocked_dates'
];

// Alert history to prevent spam
const alertHistory = new Map();
const ALERT_COOLDOWN_MS = 300000; // 5 minutes

function shouldAlert(rpcName, alertType) {
  const key = `${rpcName}_${alertType}`;
  const lastAlert = alertHistory.get(key);
  
  if (!lastAlert) {
    alertHistory.set(key, Date.now());
    return true;
  }
  
  if (Date.now() - lastAlert > ALERT_COOLDOWN_MS) {
    alertHistory.set(key, Date.now());
    return true;
  }
  
  return false;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusEmoji(value, threshold, inverse = false) {
  const isGood = inverse ? value < threshold : value > threshold;
  return isGood ? '🟢' : '🔴';
}

async function checkRPCPerformance(rpcName) {
  try {
    const stats = await logger.getStats(rpcName, 1); // Last hour
    
    if (stats.noData) {
      return { rpcName, status: 'NO_DATA', alerts: [] };
    }

    const alerts = [];
    
    // Check P95 latency
    if (stats.p95 > ALERT_THRESHOLDS.p95) {
      if (shouldAlert(rpcName, 'HIGH_P95')) {
        alerts.push({
          type: 'HIGH_P95',
          severity: 'HIGH',
          message: `P95 latency is ${formatDuration(stats.p95)} (threshold: ${formatDuration(ALERT_THRESHOLDS.p95)})`,
          value: stats.p95,
          threshold: ALERT_THRESHOLDS.p95
        });
      }
    }
    
    // Check average duration
    if (stats.avgDuration > ALERT_THRESHOLDS.avgDuration) {
      if (shouldAlert(rpcName, 'HIGH_AVG')) {
        alerts.push({
          type: 'HIGH_AVG',
          severity: 'MEDIUM',
          message: `Average latency is ${formatDuration(stats.avgDuration)} (threshold: ${formatDuration(ALERT_THRESHOLDS.avgDuration)})`,
          value: stats.avgDuration,
          threshold: ALERT_THRESHOLDS.avgDuration
        });
      }
    }
    
    // Check success rate
    if (stats.successRate < ALERT_THRESHOLDS.successRate) {
      if (shouldAlert(rpcName, 'LOW_SUCCESS')) {
        alerts.push({
          type: 'LOW_SUCCESS_RATE',
          severity: 'CRITICAL',
          message: `Success rate is ${stats.successRate.toFixed(2)}% (threshold: ${ALERT_THRESHOLDS.successRate}%)`,
          value: stats.successRate,
          threshold: ALERT_THRESHOLDS.successRate
        });
      }
    }

    return {
      rpcName,
      status: alerts.length > 0 ? 'ALERT' : 'OK',
      stats,
      alerts
    };
  } catch (error) {
    console.error(`Error checking ${rpcName}:`, error.message);
    return {
      rpcName,
      status: 'ERROR',
      error: error.message,
      alerts: []
    };
  }
}

function printDashboard(results) {
  console.clear();
  console.log('=================================================================');
  console.log('SUPABASE RPC PERFORMANCE MONITOR');
  console.log('=================================================================');
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`Monitoring ${RPC_FUNCTIONS.length} RPC functions`);
  console.log('');

  // Summary
  const okCount = results.filter(r => r.status === 'OK').length;
  const alertCount = results.filter(r => r.status === 'ALERT').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  const noDataCount = results.filter(r => r.status === 'NO_DATA').length;

  console.log('📊 SUMMARY');
  console.log(`  🟢 OK: ${okCount}`);
  console.log(`  🔴 Alerts: ${alertCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  ⚪ No Data: ${noDataCount}`);
  console.log('');

  // Active alerts
  const activeAlerts = results.filter(r => r.alerts && r.alerts.length > 0);
  if (activeAlerts.length > 0) {
    console.log('🚨 ACTIVE ALERTS');
    activeAlerts.forEach(result => {
      console.log(`\n  ${result.rpcName}:`);
      result.alerts.forEach(alert => {
        const icon = alert.severity === 'CRITICAL' ? '🔴' : alert.severity === 'HIGH' ? '🟠' : '🟡';
        console.log(`    ${icon} ${alert.message}`);
      });
    });
    console.log('');
  }

  // Performance table
  console.log('📈 PERFORMANCE METRICS (Last Hour)');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Function                          Calls   P95      Avg      Success');
  console.log('─────────────────────────────────────────────────────────────────');

  results.forEach(result => {
    if (result.status === 'NO_DATA' || result.status === 'ERROR') {
      const status = result.status === 'NO_DATA' ? '⚪ No Data' : '❌ Error';
      console.log(`${result.rpcName.padEnd(30)} ${status}`);
    } else {
      const stats = result.stats;
      const statusIcon = result.status === 'OK' ? '🟢' : '🔴';
      const calls = stats.totalCalls.toString().padStart(6);
      const p95 = formatDuration(stats.p95).padStart(8);
      const avg = formatDuration(stats.avgDuration).padStart(8);
      const success = `${stats.successRate.toFixed(1)}%`.padStart(7);
      
      console.log(`${statusIcon} ${result.rpcName.padEnd(28)} ${calls} ${p95} ${avg} ${success}`);
    }
  });

  console.log('─────────────────────────────────────────────────────────────────');
  console.log('');
  console.log(`Next check in ${MONITOR_INTERVAL_MS / 1000}s...`);
  console.log('Press Ctrl+C to stop monitoring');
}

async function monitorLoop() {
  while (true) {
    const results = await Promise.all(
      RPC_FUNCTIONS.map(rpcName => checkRPCPerformance(rpcName))
    );

    printDashboard(results);

    // Send critical alerts (could integrate with Slack, email, etc.)
    const criticalAlerts = results
      .flatMap(r => r.alerts || [])
      .filter(a => a.severity === 'CRITICAL');

    if (criticalAlerts.length > 0) {
      // TODO: Integrate with alerting system (Slack, PagerDuty, etc.)
      console.log('\n⚠️  CRITICAL ALERTS DETECTED - Consider immediate action!');
    }

    await new Promise(resolve => setTimeout(resolve, MONITOR_INTERVAL_MS));
  }
}

// Start monitoring
console.log('Starting real-time performance monitor...');
console.log('');

monitorLoop().catch(error => {
  console.error('Monitor crashed:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nStopping monitor...');
  process.exit(0);
});
