# Supabase RPC Performance Testing Suite

Comprehensive performance testing infrastructure for ReHome's Supabase RPC functions, with focus on item moving pricing calculations.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Quick Start](#quick-start)
- [Test Suites](#test-suites)
- [Performance Thresholds](#performance-thresholds)
- [Optimization Guide](#optimization-guide)
- [Continuous Monitoring](#continuous-monitoring)

## 🎯 Overview

This testing suite provides three complementary approaches to performance testing:

1. **SQL Profiling** - Direct database analysis using EXPLAIN ANALYZE
2. **Load Testing** - Concurrent user simulation with k6
3. **Automated Benchmarks** - Programmatic performance assertions

## 🧪 Test Types

### 1. SQL Profiling (Manual)

**Location:** `sql-profiling/`

Run directly in Supabase SQL Editor to analyze query execution plans, identify bottlenecks, and verify index usage.

**Files:**
- `profile-all-rpcs.sql` - Complete profiling suite for all RPC functions
- `optimize-indexes.sql` - Index analysis and optimization

**What it measures:**
- Query planning time
- Execution time
- Sequential scans vs index scans
- Buffer cache hit ratio
- Row counts and data distribution

### 2. K6 Load Testing (Automated)

**Location:** `k6-load-tests/`

Simulates concurrent users to measure performance under realistic load conditions.

**Files:**
- `rpc-load-test.js` - General RPC load testing
- `pricing-specific-test.js` - Item moving pricing flow simulation

**What it measures:**
- Response time percentiles (P50, P95, P99)
- Throughput (requests per second)
- Error rates under load
- Concurrent user capacity

### 3. Automated Benchmarks (Programmatic)

**Location:** `automated-benchmarks/`

Node.js-based benchmark suite with timing assertions and performance regression detection.

**Files:**
- `benchmark-suite.js` - Comprehensive benchmark with thresholds

**What it measures:**
- Average, min, max latency
- Percentile distributions
- Success/failure rates
- Performance against defined thresholds

### 4. Continuous Monitoring (Production)

**Location:** `monitoring/`

Real-time performance monitoring and alerting for production environments.

**Files:**
- `performance-logger.js` - Performance logging utility
- `real-time-monitor.js` - Live performance dashboard

**What it provides:**
- Real-time performance metrics
- Anomaly detection
- Historical trend analysis
- Alert notifications

## 🚀 Quick Start

### Prerequisites

```bash
# Install k6 (for load testing)
# Windows (using Chocolatey)
choco install k6

# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Install Node.js dependencies
cd automated-benchmarks
npm install @supabase/supabase-js dotenv
```

### Environment Setup

Create a `.env` file in the `rehome-backend` directory:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

## 📊 Test Suites

### SQL Profiling

```sql
-- Run in Supabase SQL Editor

-- 1. Profile all RPC functions
\i sql-profiling/profile-all-rpcs.sql

-- 2. Optimize indexes
\i sql-profiling/optimize-indexes.sql
```

**Expected Results:**
- Planning time: < 1ms
- Execution time: < 10ms for simple queries, < 100ms for complex
- Index scans should be used (not sequential scans)
- Buffer hit ratio: > 95%

### K6 Load Testing

```bash
# Basic load test
k6 run k6-load-tests/rpc-load-test.js

# Custom load test
k6 run --vus 50 --duration 2m k6-load-tests/rpc-load-test.js

# Pricing-specific flow test
k6 run k6-load-tests/pricing-specific-test.js

# With environment variables
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_KEY=your-key \
k6 run k6-load-tests/rpc-load-test.js
```

**Expected Results:**
- P95 latency: < 500ms
- P99 latency: < 1000ms
- Error rate: < 5%
- Successful completion of all test scenarios

### Automated Benchmarks

```bash
cd automated-benchmarks
node benchmark-suite.js
```

**Expected Results:**
- All tests pass defined thresholds
- Results exported to JSON file
- Performance regression detection

### Real-Time Monitoring

```bash
# Set up performance logging table first (run in Supabase SQL Editor)
-- See CREATE_TABLE_SQL in performance-logger.js

# Start monitoring
cd monitoring
node real-time-monitor.js
```

## 📈 Performance Thresholds

### RPC Function Categories

| Category | Functions | P95 Target | P99 Target |
|----------|-----------|------------|------------|
| **Fast** | `get_pricing_config_cached`, `get_city_base_charges`, `calculate_distance_cost`, `is_date_blocked` | < 50ms | < 100ms |
| **Normal** | `get_city_schedule_status`, `get_furniture_items_with_points`, `get_batch_city_schedules` | < 200ms | < 400ms |
| **Complex** | `get_month_schedule`, `get_city_days_in_range`, `get_blocked_dates` | < 500ms | < 1000ms |

### Load Testing Thresholds

- **Normal Load:** 5-10 concurrent users
- **Peak Load:** 20-50 concurrent users
- **Stress Test:** 50-100+ concurrent users

### Success Criteria

- ✅ **Excellent:** P95 < 50% of threshold
- 🟡 **Good:** P95 < threshold
- 🟠 **Warning:** P95 < 150% of threshold
- 🔴 **Failed:** P95 > 150% of threshold

## 🔧 Optimization Guide

### Common Performance Issues

#### 1. Sequential Scans

**Symptom:** EXPLAIN shows "Seq Scan" instead of "Index Scan"

**Solution:**
```sql
-- Add appropriate index
CREATE INDEX idx_table_column ON table_name(column_name);
ANALYZE table_name;
```

#### 2. Missing Statistics

**Symptom:** Poor query plans, incorrect row estimates

**Solution:**
```sql
-- Update table statistics
ANALYZE table_name;

-- Or for all tables
ANALYZE;
```

#### 3. High Buffer Misses

**Symptom:** Low shared buffer hit ratio (< 95%)

**Solution:**
- Increase shared_buffers in Postgres config
- Add covering indexes to reduce table lookups
- Consider materialized views for complex queries

#### 4. Slow RLS Policies

**Symptom:** auth.uid() calls in RLS policies slow down queries

**Solution:**
```sql
-- Use SECURITY DEFINER functions instead
-- Cache auth.uid() result in function variable
CREATE OR REPLACE FUNCTION my_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  -- Use current_user_id in queries
END;
$$;
```

#### 5. N+1 Query Problems

**Symptom:** Multiple individual RPC calls instead of batch operations

**Solution:**
- Use `get_batch_city_schedules` instead of multiple `get_city_schedule_status` calls
- Implement batch RPC functions for common patterns
- Use PostgreSQL array operations

### Optimization Checklist

- [ ] All tables have appropriate indexes
- [ ] Indexes are being used (verify with EXPLAIN)
- [ ] Table statistics are up to date (run ANALYZE)
- [ ] RLS policies are optimized
- [ ] Batch operations used where possible
- [ ] Functions marked as STABLE or IMMUTABLE where appropriate
- [ ] Connection pooling configured
- [ ] Query results cached on client side

## 📊 Continuous Monitoring

### Production Monitoring Setup

1. **Create Performance Logging Table**

```sql
-- Run in Supabase SQL Editor
-- See CREATE_TABLE_SQL in monitoring/performance-logger.js
```

2. **Integrate Performance Logger**

```javascript
import PerformanceLogger from './monitoring/performance-logger.js';

const logger = new PerformanceLogger(SUPABASE_URL, SUPABASE_KEY);

// Wrap RPC calls
const result = await logger.measureRPC(
  'get_pricing_config_cached',
  async (params) => {
    return await supabase.rpc('get_pricing_config_cached', params);
  },
  {},
  { userId: 'user123', page: 'pricing' }
);
```

3. **Start Real-Time Monitor**

```bash
cd monitoring
node real-time-monitor.js
```

### Alerting Integration

Modify `real-time-monitor.js` to integrate with your alerting system:

```javascript
// Example: Slack webhook
async function sendAlert(alert) {
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      text: `🚨 Performance Alert: ${alert.message}`
    })
  });
}
```

## 📝 Best Practices

### 1. Regular Testing Schedule

- **Daily:** Run automated benchmarks
- **Weekly:** Run k6 load tests
- **Monthly:** Full SQL profiling and optimization review
- **Continuous:** Real-time monitoring in production

### 2. Performance Regression Prevention

- Run benchmarks in CI/CD pipeline
- Set up performance budgets
- Alert on threshold violations
- Track trends over time

### 3. Database Maintenance

```sql
-- Weekly maintenance
VACUUM ANALYZE;

-- Check for bloated indexes
SELECT schemaname, tablename, indexname, 
       pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- Reindex if needed
REINDEX TABLE table_name;
```

### 4. Optimization Workflow

1. **Identify:** Use profiling to find slow queries
2. **Analyze:** Run EXPLAIN ANALYZE to understand why
3. **Optimize:** Add indexes, rewrite queries, or cache results
4. **Verify:** Re-run tests to confirm improvement
5. **Monitor:** Track performance over time

## 🎯 Performance Goals

### Item Moving Pricing Flow

Complete user journey from page load to price calculation:

- **Target:** < 2 seconds end-to-end
- **Breakdown:**
  - Initial config load: < 200ms
  - Date validation: < 100ms
  - Calendar load: < 500ms
  - Distance calculation: < 50ms
  - Final price calculation: < 200ms

### Concurrent User Capacity

- **Normal:** 50 concurrent users with < 500ms P95
- **Peak:** 100 concurrent users with < 1000ms P95
- **Maximum:** 200+ concurrent users before degradation

## 🐛 Troubleshooting

### High Latency

1. Check network latency to Supabase
2. Verify indexes are being used
3. Check for table bloat
4. Review RLS policies
5. Analyze query plans

### High Error Rate

1. Check Supabase logs
2. Verify API key permissions
3. Check rate limits
4. Review function error handling
5. Monitor database connections

### Inconsistent Performance

1. Check for cache invalidation issues
2. Review connection pool settings
3. Analyze traffic patterns
4. Check for competing queries
5. Monitor database CPU/memory

## 📚 Additional Resources

- [Supabase Performance Debugging](https://supabase.com/docs/guides/database/debugging-performance)
- [PostgreSQL EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [k6 Documentation](https://k6.io/docs/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

## 🤝 Contributing

When adding new RPC functions:

1. Add profiling queries to `profile-all-rpcs.sql`
2. Add load test scenarios to k6 scripts
3. Add benchmark tests to `benchmark-suite.js`
4. Update performance thresholds
5. Document expected performance characteristics

## 📄 License

MIT License - See LICENSE file for details
