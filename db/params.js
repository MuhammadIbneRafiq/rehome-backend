import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "set" : "not set");

const supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Use process.env for PostgreSQL connection if available, otherwise null
const connectionString = process.env.POSTGRES_CONNECTION_STRING;
const pool = new pg.Pool({ connectionString });

export { supabaseClient, pool };