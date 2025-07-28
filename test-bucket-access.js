import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yhlenudckwewmejigxvl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0';
// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function testBucketAccess() {
  try {
    console.log('🧪 Testing special-requests bucket access...');

    // 1. Check if bucket exists
    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('special-requests');
    
    if (bucketError) {
      console.error('❌ Bucket access error:', bucketError);
      return;
    }

    console.log('✅ Bucket exists:', bucketData);

    // 2. Test upload with a simple test image
    const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const testFileName = `test-${Date.now()}.png`;
    
    console.log('📤 Uploading test image...');
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('special-requests')
      .upload(testFileName, testImageData, {
        contentType: 'image/png'
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return;
    }

    console.log('✅ Upload successful:', uploadData);

    // 3. Test public URL generation
    const { data: urlData } = supabase.storage
      .from('special-requests')
      .getPublicUrl(testFileName);

    if (urlData?.publicUrl) {
      console.log('✅ Public URL generated:', urlData.publicUrl);
    } else {
      console.error('❌ Failed to generate public URL');
    }

    // 4. Clean up test file
    const { error: deleteError } = await supabase.storage
      .from('special-requests')
      .remove([testFileName]);

    if (deleteError) {
      console.error('⚠️  Could not delete test file:', deleteError);
    } else {
      console.log('✅ Test file cleaned up');
    }

    console.log('🎉 Bucket test completed successfully!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testBucketAccess(); 