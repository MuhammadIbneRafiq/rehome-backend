import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://yhlenudckwewmejigxvl.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0';


if (!supabaseKey) {
  console.error('❌ SUPABASE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testImageUpload() {
  console.log('🧪 Testing Supabase Storage Upload...\n');

  // Create a simple test image buffer (1x1 pixel PNG)
  const testImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const fileName = `test-uploads/test-${Date.now()}.png`;

  console.log(`📤 Uploading test image to: transport-images/${fileName}`);

  try {
    // Test upload to transport-images bucket
    const { data, error } = await supabase.storage
      .from('transport-images')
      .upload(fileName, testImageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (error) {
      console.error('❌ Upload failed:', error);
      return;
    }

    console.log('✅ Upload successful!');
    console.log('📦 Upload data:', data);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('transport-images')
      .getPublicUrl(fileName);

    console.log('🔗 Public URL:', publicUrl);

    // Verify the file exists
    const { data: listData, error: listError } = await supabase.storage
      .from('transport-images')
      .list('test-uploads');

    if (listError) {
      console.error('❌ List failed:', listError);
      return;
    }

    console.log('📋 Files in test-uploads folder:', listData);

    // Clean up - delete the test file
    const { error: deleteError } = await supabase.storage
      .from('transport-images')
      .remove([fileName]);

    if (deleteError) {
      console.error('⚠️  Cleanup failed:', deleteError);
    } else {
      console.log('🧹 Test file cleaned up successfully');
    }

  } catch (err) {
    console.error('❌ Test failed with exception:', err);
  }
}

// Run the test
testImageUpload()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });
