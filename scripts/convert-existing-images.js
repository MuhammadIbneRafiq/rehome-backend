import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import imageProcessingService from '../services/imageProcessingService.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Download image from Supabase storage
 * @param {string} imageUrl - Full image URL
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImageFromStorage(imageUrl) {
    try {
        // Extract the file path from the URL
        const urlParts = imageUrl.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
            throw new Error(`Invalid Supabase storage URL: ${imageUrl}`);
        }
        
        const filePath = urlParts[1];
        console.log(`Downloading image: ${filePath}`);
        
        const { data, error } = await supabase.storage
            .from('furniture-images')
            .download(filePath);
        
        if (error) {
            throw new Error(`Failed to download ${filePath}: ${error.message}`);
        }
        
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error downloading image from ${imageUrl}:`, error);
        throw error;
    }
}

/**
 * Upload converted image to Supabase storage
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - New filename
 * @param {string} mimeType - MIME type
 * @returns {Promise<string>} - New image URL
 */
async function uploadConvertedImage(buffer, filename, mimeType) {
    try {
        console.log(`Uploading converted image: ${filename}`);
        
        const { data, error } = await supabase.storage
            .from('furniture-images')
            .upload(filename, buffer, {
                contentType: mimeType,
                upsert: false
            });
        
        if (error) {
            throw new Error(`Failed to upload ${filename}: ${error.message}`);
        }
        
        const newImageUrl = `${supabaseUrl}/storage/v1/object/public/furniture-images/${filename}`;
        console.log(`Upload successful: ${newImageUrl}`);
        
        return newImageUrl;
    } catch (error) {
        console.error(`Error uploading converted image:`, error);
        throw error;
    }
}

/**
 * Delete old image from Supabase storage
 * @param {string} imageUrl - Full image URL to delete
 */
async function deleteOldImage(imageUrl) {
    try {
        const urlParts = imageUrl.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
            console.warn(`Cannot delete image with invalid URL: ${imageUrl}`);
            return;
        }
        
        const filePath = urlParts[1];
        console.log(`Deleting old image: ${filePath}`);
        
        const { error } = await supabase.storage
            .from('furniture-images')
            .remove([filePath]);
        
        if (error) {
            console.warn(`Failed to delete old image ${filePath}:`, error.message);
        } else {
            console.log(`Old image deleted: ${filePath}`);
        }
    } catch (error) {
        console.warn(`Error deleting old image:`, error);
    }
}

/**
 * Convert a single image URL
 * @param {string} imageUrl - Original image URL
 * @returns {Promise<string|null>} - New image URL or null if conversion failed
 */
async function convertSingleImage(imageUrl) {
    try {
        // Check if image needs conversion (has HEIC extension)
        if (!imageUrl.toLowerCase().includes('.heic')) {
            console.log(`Skipping non-HEIC image: ${imageUrl}`);
            return imageUrl; // Return original URL if not HEIC
        }
        
        console.log(`\n🔄 Converting HEIC image: ${imageUrl}`);
        
        // Download the original image
        const originalBuffer = await downloadImageFromStorage(imageUrl);
        
        // Extract original filename for logging
        const originalFilename = imageUrl.split('/').pop();
        
        // Convert the image
        const conversionResult = await imageProcessingService.convertImageToWebFormat(
            originalBuffer,
            originalFilename,
            {
                quality: 85,
                maxWidth: 1920,
                maxHeight: 1080
            }
        );
        
        // Upload the converted image
        const newImageUrl = await uploadConvertedImage(
            conversionResult.buffer,
            conversionResult.filename,
            conversionResult.mimeType
        );
        
        // Delete the old image
        await deleteOldImage(imageUrl);
        
        console.log(`✅ Conversion completed: ${originalFilename} -> ${conversionResult.filename}`);
        return newImageUrl;
        
    } catch (error) {
        console.error(`❌ Failed to convert image ${imageUrl}:`, error.message);
        return null; // Return null to indicate conversion failed
    }
}

/**
 * Update database with new image URLs
 * @param {string} itemId - Furniture item ID
 * @param {string[]} newImageUrls - Array of new image URLs
 */
async function updateDatabaseImageUrls(itemId, newImageUrls) {
    try {
        console.log(`Updating database for item ${itemId} with ${newImageUrls.length} images`);
        
        const { data, error } = await supabase
            .from('marketplace_furniture')
            .update({
                image_urls: newImageUrls,
                updated_at: new Date().toISOString()
            })
            .eq('id', itemId)
            .select();
        
        if (error) {
            throw new Error(`Database update failed: ${error.message}`);
        }
        
        console.log(`✅ Database updated for item ${itemId}`);
        return data;
    } catch (error) {
        console.error(`❌ Failed to update database for item ${itemId}:`, error);
        throw error;
    }
}

/**
 * Find all furniture items with HEIC images
 * @returns {Promise<Array>} - Array of furniture items with HEIC images
 */
async function findItemsWithHeicImages() {
    try {
        console.log('🔍 Searching for items with HEIC images...');
        
        const { data, error } = await supabase
            .from('marketplace_furniture')
            .select('id, name, image_urls')
            .not('image_urls', 'is', null);
        
        if (error) {
            throw new Error(`Failed to fetch furniture items: ${error.message}`);
        }
        
        // Filter items that have HEIC images
        const itemsWithHeic = data.filter(item => {
            if (!item.image_urls || !Array.isArray(item.image_urls)) return false;
            
            return item.image_urls.some(url => 
                url && typeof url === 'string' && url.toLowerCase().includes('.heic')
            );
        });
        
        console.log(`Found ${itemsWithHeic.length} items with HEIC images out of ${data.length} total items`);
        
        return itemsWithHeic;
    } catch (error) {
        console.error('Error finding items with HEIC images:', error);
        throw error;
    }
}

/**
 * Main conversion function
 */
async function convertExistingHeicImages() {
    console.log('🚀 Starting HEIC image conversion process...\n');
    
    try {
        // Find all items with HEIC images
        const itemsWithHeic = await findItemsWithHeicImages();
        
        if (itemsWithHeic.length === 0) {
            console.log('✅ No HEIC images found. Conversion complete!');
            return;
        }
        
        let successCount = 0;
        let failureCount = 0;
        
        // Process each item
        for (let i = 0; i < itemsWithHeic.length; i++) {
            const item = itemsWithHeic[i];
            console.log(`\n📦 Processing item ${i + 1}/${itemsWithHeic.length}: ${item.name} (ID: ${item.id})`);
            
            try {
                const newImageUrls = [];
                
                // Convert each image URL
                for (const imageUrl of item.image_urls) {
                    if (!imageUrl || typeof imageUrl !== 'string') {
                        console.warn(`Skipping invalid image URL: ${imageUrl}`);
                        continue;
                    }
                    
                    const convertedUrl = await convertSingleImage(imageUrl);
                    if (convertedUrl) {
                        newImageUrls.push(convertedUrl);
                    } else {
                        console.warn(`Failed to convert image, keeping original: ${imageUrl}`);
                        newImageUrls.push(imageUrl); // Keep original if conversion failed
                    }
                }
                
                // Update database with new URLs
                if (newImageUrls.length > 0) {
                    await updateDatabaseImageUrls(item.id, newImageUrls);
                    successCount++;
                    console.log(`✅ Item ${item.name} processed successfully`);
                } else {
                    console.warn(`⚠️  No images to update for item ${item.name}`);
                    failureCount++;
                }
                
            } catch (error) {
                console.error(`❌ Failed to process item ${item.name}:`, error.message);
                failureCount++;
            }
            
            // Add a small delay to avoid overwhelming the API
            if (i < itemsWithHeic.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n🎉 HEIC conversion process completed!');
        console.log(`✅ Successfully processed: ${successCount} items`);
        console.log(`❌ Failed to process: ${failureCount} items`);
        
    } catch (error) {
        console.error('💥 Conversion process failed:', error);
        process.exit(1);
    }
}

/**
 * Test conversion with a single image URL
 * @param {string} imageUrl - Image URL to test
 */
async function testSingleConversion(imageUrl) {
    console.log(`🧪 Testing conversion for: ${imageUrl}`);
    
    try {
        const result = await convertSingleImage(imageUrl);
        if (result) {
            console.log(`✅ Test successful! New URL: ${result}`);
        } else {
            console.log(`❌ Test failed`);
        }
    } catch (error) {
        console.error(`💥 Test error:`, error);
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.length > 0 && args[0] === 'test') {
        // Test mode with specific URL
        const testUrl = args[1];
        if (testUrl) {
            testSingleConversion(testUrl);
        } else {
            console.log('Usage: npm run convert-images test <image-url>');
        }
    } else {
        // Full conversion mode
        convertExistingHeicImages();
    }
} 