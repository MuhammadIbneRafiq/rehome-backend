/**
 * SETUP SCRIPT FOR PERFORMANCE LOGGING
 * 
 * This script creates the necessary database tables for performance monitoring
 * Run: node setup-performance-logging.js
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  console.error('');
  console.error('Add to your .env file:');
  console.error('SUPABASE_URL=https://your-project.supabase.co');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SETUP_SQL = `
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

CREATE INDEX IF NOT EXISTS idx_rpc_perf_logs_success 
ON rpc_performance_logs(success, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE rpc_performance_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to insert logs
DROP POLICY IF EXISTS "Allow authenticated users to insert logs" ON rpc_performance_logs;
CREATE POLICY "Allow authenticated users to insert logs"
ON rpc_performance_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy for authenticated users to read logs
DROP POLICY IF EXISTS "Allow authenticated users to read logs" ON rpc_performance_logs;
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
  
  RAISE NOTICE 'Cleaned up performance logs older than 30 days';
END;
$$;

COMMENT ON TABLE rpc_performance_logs IS 'Stores performance metrics for RPC function calls';
COMMENT ON FUNCTION cleanup_old_performance_logs IS 'Removes performance logs older than 30 days';
`;

async function setup() {
  console.log('=================================================================');
  console.log('PERFORMANCE LOGGING SETUP');
  console.log('=================================================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log('');
  console.log('⚙️  Creating performance logging infrastructure...');
  console.log('');

  try {
    // Note: Direct SQL execution requires service role key
    // For security, this should be run manually in Supabase SQL Editor
    console.log('📝 SQL Setup Required:');
    console.log('');
    console.log('Please run the following SQL in your Supabase SQL Editor:');
    console.log('(Dashboard → SQL Editor → New Query)');
    console.log('');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(SETUP_SQL);
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('');
    
    // Try to verify if table exists
    const { data, error } = await supabase
      .from('rpc_performance_logs')
      .select('count')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('⚠️  Table does not exist yet. Please run the SQL above.');
      } else {
        console.log('⚠️  Could not verify table:', error.message);
      }
    } else {
      console.log('✅ Performance logging table exists!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Run benchmarks: npm run benchmark');
      console.log('2. Start monitoring: npm run monitor');
      console.log('3. Run load tests: npm run test:load');
    }
    
    console.log('');
    console.log('=================================================================');
    console.log('SETUP COMPLETE');
    console.log('=================================================================');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setup();
