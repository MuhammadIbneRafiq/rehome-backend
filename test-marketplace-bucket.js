// Simple test to create marketplace bucket and upload a test image
import { supabaseClient } from './db/params.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testMarketplaceBucket() {
  try {
    console.log('🔍 Testing marketplace bucket...');
    
    // First, let's check if bucket exists
    const { data: buckets, error: listError } = await supabaseClient.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }
    
    console.log('📦 Existing buckets:', buckets.map(b => b.name));
    
    const marketplaceBucket = buckets.find(b => b.name === 'marketplace-images');
    if (!marketplaceBucket) {
      console.log('❌ marketplace-images bucket does not exist. Please run the SQL first.');
      return;
    } else {
      console.log('✅ marketplace-images bucket exists');
    }
    
    // Create a simple test image (1x1 PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk start
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit, RGBA
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk start
      0x54, 0x08, 0x99, 0x01, 0x01, 0x01, 0x00, 0x00, // Image data
      0xFE, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // More data
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82 // PNG end
    ]);
    
    console.log('📤 Uploading test image...');
    
    // Upload test image
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('marketplace-images')
      .upload('test-image.png', testImageBuffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('❌ Upload failed:', uploadError);
      return;
    }
    
    console.log('✅ Test image uploaded successfully:', uploadData);
    
    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('marketplace-images')
      .getPublicUrl('test-image.png');
    
    console.log('🔗 Public URL:', publicUrl);
    
    // Test download
    console.log('📥 Testing download...');
    const { data: downloadData, error: downloadError } = await supabaseClient.storage
      .from('marketplace-images')
      .download('test-image.png');
    
    if (downloadError) {
      console.error('❌ Download failed:', downloadError);
      return;
    }
    
    console.log('✅ Download successful, size:', downloadData.length, 'bytes');
    
    // Clean up test image
    const { error: deleteError } = await supabaseClient.storage
      .from('marketplace-images')
      .remove(['test-image.png']);
    
    if (deleteError) {
      console.error('⚠️  Failed to clean up test image:', deleteError);
    } else {
      console.log('🧹 Test image cleaned up');
    }
    
    console.log('🎉 Marketplace bucket test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMarketplaceBucket();
