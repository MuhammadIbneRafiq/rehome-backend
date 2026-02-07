import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Creating special-requests bucket with service role...');

// Use service role key directly for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY, // This should bypass RLS
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

async function createBucket() {
  try {
    console.log('📂 Checking existing buckets...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }
    
    console.log('📂 Current buckets:', buckets.map(b => b.name));
    
    const bucketExists = buckets.some(bucket => bucket.name === 'special-requests');
    
    if (!bucketExists) {
      console.log('📁 Creating special-requests bucket...');
      
      const { data, error } = await supabase.storage.createBucket('special-requests', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
        fileSizeLimit: 52428800, // 50MB
      });
      
      if (error) {
        console.error('❌ Error creating bucket:', error);
        return;
      }
      
      console.log('✅ Bucket created successfully:', data);
    } else {
      console.log('📁 Bucket already exists');
    }
    
    // Test access
    console.log('🧪 Testing bucket access...');
    const { data: testData, error: testError } = await supabase.storage.getBucket('special-requests');
    
    if (testError) {
      console.error('❌ Error accessing bucket:', testError);
    } else {
      console.log('✅ Bucket accessible:', testData);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

createBucket();
