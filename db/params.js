import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// Directly set the Supabase configuration values
const SUPABASE_URL = "https://okkdlbdnfaylakfbycta.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ra2RsYmRuZmF5bGFrZmJ5Y3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTM1MjIzNTIsImV4cCI6MjAyOTA5ODM1Mn0.Zf4DnOscUxz5LxbulHsMMmtyXT7Eoapg50WVgAW_Nig";

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

export { supabaseClient, pool };