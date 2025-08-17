-- Disable Row Level Security (RLS) for Supabase storage buckets
-- Run these commands in your Supabase SQL editor

-- Disable RLS for storage.objects table
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Disable RLS for storage.buckets table  
ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' 
AND tablename IN ('objects', 'buckets'); 