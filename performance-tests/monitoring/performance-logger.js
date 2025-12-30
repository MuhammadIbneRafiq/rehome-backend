/**
 * PERFORMANCE MONITORING AND LOGGING UTILITY
 * 
 * This module provides utilities to log RPC performance metrics
 * to a Supabase table for ongoing monitoring and analysis.
 */

import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

export class PerformanceLogger {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.metrics = new Map();
  }

  /**
   * Start timing an RPC call
   */
  startTimer(rpcName, metadata = {}) {
    const timerId = `${rpcName}_${Date.now()}_${Math.random()}`;
    this.metrics.set(timerId, {
      rpcName,
      startTime: performance.now(),
      metadata
    });
    return timerId;
  }

  /**
   * End timing and log the result
   */
  async endTimer(timerId, success = true, error = null) {
    const metric = this.metrics.get(timerId);
    if (!metric) {
      console.warn(`Timer ${timerId} not found`);
      return;
    }

    const duration = performance.now() - metric.startTime;
    this.metrics.delete(timerId);

    const logEntry = {
      rpc_name: metric.rpcName,
      duration_ms: duration,
      success,
      error_message: error?.message || null,
      metadata: metric.metadata,
      timestamp: new Date().toISOString()
    };

    // Log to console
    const status = success ? '✅' : '❌';
    console.log(`${status} ${metric.rpcName}: ${duration.toFixed(2)}ms`);

    // Log to Supabase (async, don't block)
    this.logToSupabase(logEntry).catch(err => {
      console.error('Failed to log to Supabase:', err.message);
    });

    return { duration, success };
  }

  /**
   * Log performance data to Supabase table
   */
  async logToSupabase(logEntry) {
    const { error } = await this.supabase
      .from('rpc_performance_logs')
      .insert([logEntry]);

    if (error) {
      throw error;
    }
  }

  /**
   * Wrapper function to automatically time an RPC call
   */
  async measureRPC(rpcName, rpcFunction, params = {}, metadata = {}) {
    const timerId = this.startTimer(rpcName, { ...metadata, params });
    
    try {
      const result = await rpcFunction(params);
      await this.endTimer(timerId, true);
      return result;
    } catch (error) {
      await this.endTimer(timerId, false, error);
      throw error;
    }
  }

  /**
   * Get performance statistics for an RPC function
   */
  async getStats(rpcName, timeRangeHours = 24) {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - timeRangeHours);

    const { data, error } = await this.supabase
      .from('rpc_performance_logs')
      .select('*')
      .eq('rpc_name', rpcName)
      .gte('timestamp', startTime.toISOString())
      .order('timestamp', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        rpcName,
        noData: true
      };
    }

    const durations = data.map(d => d.duration_ms);
    const sorted = durations.sort((a, b) => a - b);
    const successCount = data.filter(d => d.success).length;

    return {
      rpcName,
      totalCalls: data.length,
      successRate: (successCount / data.length) * 100,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: sorted[0],
      maxDuration: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      timeRange: `${timeRangeHours}h`,
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString()
    };
  }

  /**
   * Get performance trends over time
   */
  async getTrends(rpcName, intervalMinutes = 60, timeRangeHours = 24) {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - timeRangeHours);

    const { data, error } = await this.supabase
      .from('rpc_performance_logs')
      .select('*')
      .eq('rpc_name', rpcName)
      .gte('timestamp', startTime.toISOString())
      .order('timestamp', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return [];
    }

    // Group by time intervals
    const intervals = new Map();
    const intervalMs = intervalMinutes * 60 * 1000;

    data.forEach(log => {
      const timestamp = new Date(log.timestamp).getTime();
      const intervalKey = Math.floor(timestamp / intervalMs) * intervalMs;
      
      if (!intervals.has(intervalKey)) {
        intervals.set(intervalKey, []);
      }
      intervals.get(intervalKey).push(log.duration_ms);
    });

    // Calculate stats for each interval
    return Array.from(intervals.entries()).map(([timestamp, durations]) => {
      const sorted = durations.sort((a, b) => a - b);
      return {
        timestamp: new Date(timestamp).toISOString(),
        count: durations.length,
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)]
      };
    });
  }

  /**
   * Detect performance anomalies
   */
  async detectAnomalies(rpcName, thresholdMs = 500) {
    const stats = await this.getStats(rpcName, 24);
    
    if (stats.noData) {
      return { hasAnomalies: false, message: 'No data available' };
    }

    const anomalies = [];

    if (stats.p95 > thresholdMs) {
      anomalies.push({
        type: 'HIGH_P95',
        message: `P95 latency (${stats.p95.toFixed(2)}ms) exceeds threshold (${thresholdMs}ms)`,
        severity: 'HIGH'
      });
    }

    if (stats.avgDuration > thresholdMs * 0.5) {
      anomalies.push({
        type: 'HIGH_AVG',
        message: `Average latency (${stats.avgDuration.toFixed(2)}ms) is high`,
        severity: 'MEDIUM'
      });
    }

    if (stats.successRate < 95) {
      anomalies.push({
        type: 'LOW_SUCCESS_RATE',
        message: `Success rate (${stats.successRate.toFixed(2)}%) is below 95%`,
        severity: 'CRITICAL'
      });
    }

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
      stats
    };
  }

  /**
   * Generate performance report
   */
  async generateReport(timeRangeHours = 24) {
    const rpcFunctions = [
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

    const report = {
      generatedAt: new Date().toISOString(),
      timeRange: `${timeRangeHours}h`,
      functions: []
    };

    for (const rpcName of rpcFunctions) {
      const stats = await this.getStats(rpcName, timeRangeHours);
      const anomalies = await this.detectAnomalies(rpcName);
      
      report.functions.push({
        name: rpcName,
        stats,
        anomalies: anomalies.hasAnomalies ? anomalies.anomalies : []
      });
    }

    return report;
  }
}

/**
 * Create the performance logging table in Supabase
 * Run this SQL in Supabase SQL Editor:
 */
export const CREATE_TABLE_SQL = `
-- Create performance logging table
CREATE TABLE IF NOT EXISTS rpc_performance_logs (
  id BIGSERIAL PRIMARY KEY,
  rpc_name TEXT NOT NULL,
  duration_ms NUMERIC NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_rpc_perf_logs_rpc_name 
ON rpc_performance_logs(rpc_name);

CREATE INDEX IF NOT EXISTS idx_rpc_perf_logs_timestamp 
ON rpc_performance_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rpc_perf_logs_rpc_timestamp 
ON rpc_performance_logs(rpc_name, timestamp DESC);

-- Create index for success filtering
CREATE INDEX IF NOT EXISTS idx_rpc_perf_logs_success 
ON rpc_performance_logs(success, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE rpc_performance_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to insert logs
CREATE POLICY "Allow authenticated users to insert logs"
ON rpc_performance_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy for authenticated users to read logs
CREATE POLICY "Allow authenticated users to read logs"
ON rpc_performance_logs
FOR SELECT
TO authenticated
USING (true);

-- Create function to clean old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_performance_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rpc_performance_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$;

-- Create a scheduled job to run cleanup (if pg_cron is available)
-- SELECT cron.schedule('cleanup-perf-logs', '0 2 * * *', 'SELECT cleanup_old_performance_logs()');

COMMENT ON TABLE rpc_performance_logs IS 'Stores performance metrics for RPC function calls';
`;

export default PerformanceLogger;
