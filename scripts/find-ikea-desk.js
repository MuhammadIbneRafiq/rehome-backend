import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getImageSize(url) {
    try {
        const urlParts = url.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
            console.warn(`Invalid Supabase storage URL: ${url}`);
            return null;
        }
        
        const filePath = urlParts[1];
        
        const { data, error } = await supabase.storage
            .from('furniture-images')
            .download(filePath);
        
        if (error) {
            console.warn(`Failed to get size for ${filePath}:`, error.message);
            return null;
        }
        
        const arrayBuffer = await data.arrayBuffer();
        const sizeInBytes = arrayBuffer.byteLength;
        const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
        
        return {
            sizeInBytes,
            sizeInMB: parseFloat(sizeInMB),
            filePath
        };
    } catch (error) {
        console.warn(`Error getting size for ${url}:`, error.message);
        return null;
    }
}

async function findIkeaDesk() {
    try {
        console.log('🔍 Searching for IKEA desk items...\n');
        
        // Search for items that might be IKEA desks
        const { data: items, error } = await supabase
            .from('marketplace_furniture')
            .select('id, name, description, image_urls, price, created_at, seller_email')
            .or('name.ilike.%ikea%,name.ilike.%desk%,description.ilike.%ikea%,description.ilike.%desk%')
            .not('image_urls', 'is', null);
        
        if (error) {
            throw new Error(`Database search failed: ${error.message}`);
        }
        
        if (!items || items.length === 0) {
            console.log('❌ No IKEA desk items found in the database');
            return;
        }
        
        console.log(`📋 Found ${items.length} potential IKEA desk item(s):\n`);
        
        for (const item of items) {
            console.log(`🪑 Item: ${item.name}`);
            console.log(`📝 Description: ${item.description}`);
            console.log(`💰 Price: €${item.price}`);
            console.log(`📧 Seller: ${item.seller_email}`);
            console.log(`📅 Created: ${new Date(item.created_at).toLocaleDateString()}`);
            console.log(`🆔 ID: ${item.id}`);
            
            if (item.image_urls && Array.isArray(item.image_urls)) {
                console.log(`🖼️  Images (${item.image_urls.length}):`);
                
                for (let i = 0; i < item.image_urls.length; i++) {
                    const imageUrl = item.image_urls[i];
                    console.log(`  ${i + 1}. ${imageUrl}`);
                    
                    const sizeInfo = await getImageSize(imageUrl);
                    if (sizeInfo) {
                        console.log(`     📊 Size: ${sizeInfo.sizeInMB} MB`);
                        
                        if (sizeInfo.sizeInMB >= 3) {
                            console.log(`     ⚠️  LARGE FILE! This image is ${sizeInfo.sizeInMB} MB - needs optimization`);
                        }
                    }
                }
            } else {
                console.log('🖼️  No images found');
            }
            
            console.log('─'.repeat(60));
        }
        
        // Find the largest images across all items
        console.log('\n🔍 Finding all large images (>3MB)...\n');
        
        const largeImages = [];
        
        for (const item of items) {
            if (item.image_urls && Array.isArray(item.image_urls)) {
                for (const imageUrl of item.image_urls) {
                    const sizeInfo = await getImageSize(imageUrl);
                    if (sizeInfo && sizeInfo.sizeInMB >= 3) {
                        largeImages.push({
                            url: imageUrl,
                            size: sizeInfo.sizeInMB,
                            item: item.name,
                            itemId: item.id
                        });
                    }
                }
            }
        }
        
        if (largeImages.length > 0) {
            console.log(`⚠️  Found ${largeImages.length} large image(s) that need optimization:`);
            largeImages.sort((a, b) => b.size - a.size); // Sort by size descending
            
            largeImages.forEach((img, index) => {
                console.log(`${index + 1}. ${img.item} (${img.size} MB)`);
                console.log(`   URL: ${img.url}`);
                console.log(`   Item ID: ${img.itemId}`);
            });
            
            console.log('\n💡 You can use these URLs in the optimize-all-images.js script!');
        } else {
            console.log('✅ No large images found');
        }
        
    } catch (error) {
        console.error('❌ Error searching for IKEA desk:', error);
    }
}

// Run the search
findIkeaDesk().catch(console.error); 