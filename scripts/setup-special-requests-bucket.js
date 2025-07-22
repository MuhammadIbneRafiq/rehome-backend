const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://nveahhvdavhkkujqoevl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZWFoaHZkYXZoa2t1anFvZXZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTUwMDgzOCwiZXhwIjoyMDQ3MDc2ODM4fQ.eiBqhTM34EJ8iXWOdpnAw7UDZ-vGhJjVKhPTwKqaY9M',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function setupSpecialRequestsBucket() {
  try {
    console.log('🔧 Setting up special-requests storage bucket...');

    // Check if bucket already exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Error listing buckets:', bucketsError);
      return;
    }

    console.log('📂 Current buckets:', buckets.map(b => b.name));

    const bucketExists = buckets.some(bucket => bucket.name === 'special-requests');

    if (!bucketExists) {
      console.log('📁 Creating special-requests bucket...');
      
      // Create the bucket
      const { data: createData, error: createError } = await supabase.storage.createBucket('special-requests', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
        fileSizeLimit: 52428800, // 50MB in bytes
      });

      if (createError) {
        console.error('❌ Error creating bucket:', createError);
        return;
      }

      console.log('✅ Bucket created successfully:', createData);
    } else {
      console.log('📁 Bucket special-requests already exists');
    }

    // Update bucket to ensure it's public
    console.log('🔧 Updating bucket to be public...');
    const { data: updateData, error: updateError } = await supabase.storage.updateBucket('special-requests', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
      fileSizeLimit: 52428800, // 50MB in bytes
    });

    if (updateError) {
      console.error('❌ Error updating bucket:', updateError);
      return;
    }

    console.log('✅ Bucket updated successfully:', updateData);

    // Test bucket accessibility
    console.log('🧪 Testing bucket accessibility...');
    const { data: testData, error: testError } = await supabase.storage.getBucket('special-requests');
    
    if (testError) {
      console.error('❌ Error accessing bucket:', testError);
      return;
    }

    console.log('✅ Bucket is accessible:', testData);
    console.log('🎉 Special requests bucket setup complete!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the setup
setupSpecialRequestsBucket(); 