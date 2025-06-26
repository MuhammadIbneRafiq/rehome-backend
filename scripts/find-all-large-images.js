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

async function findAllLargeImages() {
    try {
        console.log('🔍 Searching for ALL large images in the database...\n');
        
        // Get ALL items with images
        const { data: items, error } = await supabase
            .from('marketplace_furniture')
            .select('id, name, description, image_urls, price, created_at, seller_email')
            .not('image_urls', 'is', null);
        
        if (error) {
            throw new Error(`Database search failed: ${error.message}`);
        }
        
        if (!items || items.length === 0) {
            console.log('❌ No items with images found in the database');
            return;
        }
        
        console.log(`📋 Found ${items.length} items with images. Checking sizes...\n`);
        
        const allImages = [];
        let processedCount = 0;
        
        for (const item of items) {
            if (item.image_urls && Array.isArray(item.image_urls)) {
                for (const imageUrl of item.image_urls) {
                    processedCount++;
                    console.log(`📊 Processing image ${processedCount}...`);
                    
                    const sizeInfo = await getImageSize(imageUrl);
                    if (sizeInfo) {
                        allImages.push({
                            url: imageUrl,
                            size: sizeInfo.sizeInMB,
                            filePath: sizeInfo.filePath,
                            item: item.name,
                            itemId: item.id,
                            seller: item.seller_email,
                            price: item.price
                        });
                        
                        // Log if it's large
                        if (sizeInfo.sizeInMB >= 3) {
                            console.log(`   ⚠️  LARGE: ${item.name} - ${sizeInfo.sizeInMB} MB`);
                        } else {
                            console.log(`   ✅ OK: ${item.name} - ${sizeInfo.sizeInMB} MB`);
                        }
                    }
                    
                    // Small delay to avoid overwhelming the API
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        console.log(`\n📊 FINAL RESULTS:`);
        console.log(`Total images processed: ${allImages.length}`);
        
        // Sort by size descending
        allImages.sort((a, b) => b.size - a.size);
        
        // Find large images (>3MB)
        const largeImages = allImages.filter(img => img.size >= 3);
        
        console.log(`\n🚨 LARGE IMAGES (≥3MB): ${largeImages.length}`);
        if (largeImages.length > 0) {
            largeImages.forEach((img, index) => {
                console.log(`${index + 1}. ${img.item} - ${img.size} MB`);
                console.log(`   URL: ${img.url}`);
                console.log(`   File: ${img.filePath}`);
                console.log(`   Item ID: ${img.itemId}`);
                console.log(`   Seller: ${img.seller}`);
                console.log(`   Price: €${img.price}`);
                console.log();
            });
        }
        
        // Find medium images (1-3MB)
        const mediumImages = allImages.filter(img => img.size >= 1 && img.size < 3);
        console.log(`\n⚠️  MEDIUM IMAGES (1-3MB): ${mediumImages.length}`);
        if (mediumImages.length > 0) {
            console.log(`Top 10 largest medium images:`);
            mediumImages.slice(0, 10).forEach((img, index) => {
                console.log(`${index + 1}. ${img.item} - ${img.size} MB`);
            });
        }
        
        // Show top 10 largest images overall
        console.log(`\n📊 TOP 10 LARGEST IMAGES:`);
        allImages.slice(0, 10).forEach((img, index) => {
            console.log(`${index + 1}. ${img.item} - ${img.size} MB ${img.size >= 3 ? '🚨' : img.size >= 1 ? '⚠️' : '✅'}`);
        });
        
        // Generate URLs for optimization script
        if (largeImages.length > 0) {
            console.log(`\n💡 URLs for optimize-all-images.js:`);
            largeImages.forEach(img => {
                console.log(`"${img.url}",`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error searching for large images:', error);
    }
}

// Run the search
findAllLargeImages().catch(console.error); 