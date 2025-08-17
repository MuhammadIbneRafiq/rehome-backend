-- Add the same policies from furniture-images to special-requests bucket
-- Run these commands in your Supabase SQL editor

-- Policy 1: SELECT access
CREATE POLICY "SELECT gfree m3o33n_0" ON storage.objects
FOR SELECT USING (bucket_id = 'special-requests');

-- Policy 2: INSERT access  
CREATE POLICY "INSERT gfree m3o33n_1" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'special-requests');

-- Policy 3: UPDATE access
CREATE POLICY "UPDATE gfree m3o33n_2" ON storage.objects
FOR UPDATE USING (bucket_id = 'special-requests');

-- Policy 4: SELECT access for anon users to JPG images
CREATE POLICY "SELECT Give anon users access to JPG images in folder m3o33n_0" ON storage.objects
FOR SELECT USING (
  bucket_id = 'special-requests' 
  AND (storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg'])
);

-- Policy 5: INSERT access for anon users to JPG images
CREATE POLICY "INSERT Give anon users access to JPG images in folder m3o33n_1" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'special-requests'
  AND (storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg'])
);

-- Verify policies were created
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%special-requests%'; 