# Quick Start Guide - Performance Testing

Get started with performance testing in 5 minutes.

## 📋 Prerequisites

```bash
# Install k6 (load testing tool)
# Windows (Chocolatey)
choco install k6

# macOS
brew install k6

# Linux
curl -s https://dl.k6.io/key.gpg | sudo apt-key add -
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Install Node.js dependencies
cd performance-tests
npm install
```

## ⚙️ Configuration

1. **Create `.env` file** in `rehome-backend` directory:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

2. **Set up performance logging** (one-time setup):

```bash
npm run setup
```

This will show you SQL to run in Supabase SQL Editor.

## 🚀 Run Your First Test

### Option 1: Automated Benchmarks (Recommended)

```bash
npm run benchmark
```

**What it does:**
- Tests all RPC functions
- Measures latency (avg, p95, p99)
- Validates against thresholds
- Exports results to JSON

**Expected output:**
```
📊 Testing: get_city_schedule_status
   Threshold: 50.00ms | Iterations: 20
   🟢 EXCELLENT
   Min: 12.34ms | Avg: 23.45ms | Max: 45.67ms
   P50: 21.23ms | P95: 38.90ms | P99: 42.11ms
```

### Option 2: Load Testing

```bash
# Light load (10 users, 1 minute)
npm run test:load:light

# Normal load (25 users, 3 minutes)
npm run test:load

# Heavy load (50 users, 5 minutes)
npm run test:load:heavy

# Stress test (100 users, 2 minutes)
npm run test:stress
```

**What it does:**
- Simulates concurrent users
- Measures throughput
- Tests under realistic load
- Identifies breaking points

### Option 3: Real-Time Monitoring

```bash
npm run monitor
```

**What it does:**
- Live performance dashboard
- Monitors all RPC functions
- Alerts on threshold violations
- Updates every minute

## 📊 Understanding Results

### Benchmark Results

```
✅ Passed: 10    - Functions meeting performance targets
⚠️  Warnings: 2  - Functions approaching thresholds
❌ Failed: 0     - Functions exceeding thresholds
```

**Performance Ratings:**
- 🟢 **EXCELLENT**: < 50% of threshold
- 🟡 **GOOD**: < 100% of threshold
- 🟠 **WARNING**: < 150% of threshold
- 🔴 **FAILED**: > 150% of threshold

### Load Test Results

```
http_req_duration........: avg=234ms p95=456ms p99=789ms
http_req_failed..........: 2.3%
rpc_calls................: 1234
```

**Key Metrics:**
- **P95 latency**: 95% of requests faster than this
- **P99 latency**: 99% of requests faster than this
- **Error rate**: Should be < 5%

## 🎯 What to Test First

### 1. Baseline Performance (5 min)

```bash
npm run benchmark
```

Establishes baseline metrics for all RPC functions.

### 2. Pricing Flow (10 min)

```bash
npm run test:pricing
```

Tests the complete item moving pricing user journey.

### 3. SQL Profiling (15 min)

Open Supabase SQL Editor and run:

```sql
\i sql-profiling/profile-all-rpcs.sql
```

Analyzes query execution plans and identifies bottlenecks.

## 🔍 Common Issues

### Issue: "Connection failed"

**Solution:** Check your `.env` file has correct Supabase credentials.

### Issue: "Table does not exist"

**Solution:** Run the setup SQL in Supabase SQL Editor:
```bash
npm run setup
```

### Issue: "High latency detected"

**Solution:** 
1. Check network connection to Supabase
2. Run SQL profiling to identify slow queries
3. Review optimization recommendations

### Issue: "k6 command not found"

**Solution:** Install k6 using instructions in Prerequisites section.

## 📈 Performance Targets

| RPC Function | Target P95 | Target P99 |
|--------------|------------|------------|
| `get_pricing_config_cached` | < 50ms | < 100ms |
| `get_city_schedule_status` | < 50ms | < 100ms |
| `get_furniture_items_with_points` | < 200ms | < 400ms |
| `get_month_schedule` | < 500ms | < 1000ms |

## 📝 Next Steps

1. ✅ Run baseline benchmark
2. ✅ Review results and identify slow functions
3. ✅ Run SQL profiling on slow functions
4. ✅ Implement optimizations from `OPTIMIZATION_RECOMMENDATIONS.md`
5. ✅ Re-run benchmarks to verify improvements
6. ✅ Set up continuous monitoring

## 📚 Additional Resources

- **Full Documentation**: See `README.md`
- **Optimization Guide**: See `OPTIMIZATION_RECOMMENDATIONS.md`
- **SQL Profiling**: See `sql-profiling/profile-all-rpcs.sql`

## 🆘 Need Help?

Common commands:

```bash
# Run all tests
npm run benchmark && npm run test:load

# Monitor in real-time
npm run monitor

# Quick load test
npm run test:load:light

# Full pricing flow test
npm run test:pricing
```

For detailed analysis, review:
- `benchmark-results-*.json` - Benchmark data
- `performance-results.json` - Load test data
- Supabase logs - Database performance

---

**Ready to optimize?** Start with `npm run benchmark` and review the results!
