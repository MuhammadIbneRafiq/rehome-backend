import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// Supabase configuration - use service role key for backend operations
const SUPABASE_URL = "https://yhlenudckwewmejigxvl.supabase.co";
// Service role key for backend operations (has full database access)
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzIxOTQwOCwiZXhwIjoyMDUyNzk1NDA4fQ.BgQSMH3yOPKYLvVqPNnpyTrqMBvNJcw7bJTdKJr_Ql4";

console.log("Connecting to Supabase with URL:", SUPABASE_URL);

// Create Supabase client with explicit options for more reliable server-side behavior
const supabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            persistSession: false, // Don't persist session in local storage
            autoRefreshToken: false, // Don't automatically refresh token
        },
        global: {
            fetch: global.fetch, // Use Node's fetch for server-side
        },
    }
);

// Test Supabase connection on startup
const testSupabaseConnection = async () => {
    try {
        // Simple test without complex SQL
        const { data, error } = await supabaseClient.from('marketplace_messages').select('*').limit(1);
        if (error) {
            console.log('Supabase connection test (marketplace_messages not found, this is expected for new setup)');
        } else {
            console.log('Supabase connection successful. Found messages table.');
        }
    } catch (err) {
        console.log('Supabase connection test completed (expected for new setup)');
    }
};

testSupabaseConnection();

// Use process.env for PostgreSQL connection if available, otherwise null
const connectionString = process.env.POSTGRES_CONNECTION_STRING || null;
const pool = connectionString ? new pg.Pool({ connectionString }) : null;

export { supabaseClient, pool, SUPABASE_URL };