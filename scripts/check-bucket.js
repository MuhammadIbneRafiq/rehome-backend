import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBucketConfiguration() {
  console.log('Checking Supabase bucket configuration...');
  
  try {
    // 1. Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return;
    }
    
    console.log('Available buckets:', buckets?.map(b => b.name));
    
    const furnitureBucket = buckets?.find(b => b.name === 'furniture-images');
    
    if (!furnitureBucket) {
      console.log('Creating furniture-images bucket...');
      
      // Create the bucket
      const { data: createData, error: createError } = await supabase.storage.createBucket('furniture-images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        fileSizeLimit: 5242880 // 5MB
      });
      
      if (createError) {
        console.error('Error creating bucket:', createError);
        return;
      }
      
      console.log('Bucket created successfully:', createData);
    } else {
      console.log('Bucket exists:', furnitureBucket);
      
      // Ensure bucket is public
      if (!furnitureBucket.public) {
        console.log('Making bucket public...');
        
        const { data: updateData, error: updateError } = await supabase.storage.updateBucket('furniture-images', {
          public: true
        });
        
        if (updateError) {
          console.error('Error making bucket public:', updateError);
        } else {
          console.log('Bucket is now public');
        }
      }
    }
    
    // 2. Test upload and URL generation
    console.log('\nTesting image upload...');
    
    // Create a simple test image (1x1 pixel PNG)
    const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const testFileName = `test-${Date.now()}.png`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('furniture-images')
      .upload(testFileName, testImageData, {
        contentType: 'image/png'
      });
    
    if (uploadError) {
      console.error('Error uploading test image:', uploadError);
      return;
    }
    
    console.log('Test upload successful:', uploadData);
    
    // 3. Generate and test public URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/furniture-images/${testFileName}`;
    console.log('Generated public URL:', publicUrl);
    
    // 4. Clean up test file
    const { error: deleteError } = await supabase.storage
      .from('furniture-images')
      .remove([testFileName]);
    
    if (deleteError) {
      console.error('Error deleting test file:', deleteError);
    } else {
      console.log('Test file cleaned up successfully');
    }
    
    console.log('\n✅ Bucket configuration check completed successfully!');
    console.log('Your Supabase bucket is ready for image uploads.');
    
  } catch (error) {
    console.error('Error checking bucket configuration:', error);
  }
}

checkBucketConfiguration(); 