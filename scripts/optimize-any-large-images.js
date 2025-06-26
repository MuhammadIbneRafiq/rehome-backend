import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import imageProcessingService from '../services/imageProcessingService.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuration
const SIZE_THRESHOLD_MB = 2; // Images larger than this will be optimized
const QUALITY = 85; // JPEG quality
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

async function getImageSize(url) {
    try {
        const urlParts = url.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
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
        const sizeInMB = (sizeInBytes / 1024 / 1024);
        
        return {
            sizeInBytes,
            sizeInMB,
            filePath,
            buffer: Buffer.from(arrayBuffer)
        };
    } catch (error) {
        console.warn(`Error getting size for ${url}:`, error.message);
        return null;
    }
}

async function findLargeImages() {
    try {
        console.log(`🔍 Searching for images larger than ${SIZE_THRESHOLD_MB}MB...\n`);
        
        const { data: items, error } = await supabase
            .from('marketplace_furniture')
            .select('id, name, image_urls')
            .not('image_urls', 'is', null);
        
        if (error) {
            throw new Error(`Database search failed: ${error.message}`);
        }
        
        const largeImages = [];
        let processedCount = 0;
        
        for (const item of items) {
            if (item.image_urls && Array.isArray(item.image_urls)) {
                for (const imageUrl of item.image_urls) {
                    processedCount++;
                    console.log(`📊 Checking image ${processedCount}: ${item.name}...`);
                    
                    const sizeInfo = await getImageSize(imageUrl);
                    if (sizeInfo && sizeInfo.sizeInMB >= SIZE_THRESHOLD_MB) {
                        console.log(`   ⚠️  LARGE: ${sizeInfo.sizeInMB.toFixed(2)} MB - Adding to optimization queue`);
                        largeImages.push({
                            url: imageUrl,
                            ...sizeInfo,
                            itemName: item.name,
                            itemId: item.id
                        });
                    } else if (sizeInfo) {
                        console.log(`   ✅ OK: ${sizeInfo.sizeInMB.toFixed(2)} MB`);
                    }
                    
                    // Small delay to avoid overwhelming the API
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        }
        
        console.log(`\n📊 Found ${largeImages.length} images that need optimization`);
        return largeImages;
        
    } catch (error) {
        console.error('❌ Error finding large images:', error);
        return [];
    }
}

async function optimizeImage(imageData) {
    try {
        const isHeic = imageData.url.toLowerCase().includes('.heic');
        const originalFilename = imageData.url.split('/').pop();
        
        console.log(`\n🔄 ${isHeic ? 'Converting HEIC' : 'Optimizing'} image: ${originalFilename}`);
        console.log(`📊 Original file size: ${imageData.sizeInMB.toFixed(2)} MB`);
        
        // Process the image
        let conversionResult;
        if (isHeic) {
            // Convert HEIC to JPEG
            conversionResult = await imageProcessingService.convertImageToWebFormat(
                imageData.buffer,
                originalFilename,
                {
                    quality: QUALITY,
                    maxWidth: MAX_WIDTH,
                    maxHeight: MAX_HEIGHT
                }
            );
        } else {
            // Optimize existing JPEG/PNG
            const processedBuffer = await imageProcessingService.processImageWithSharp(
                imageData.buffer,
                {
                    format: originalFilename.toLowerCase().includes('.png') ? 'png' : 'jpeg',
                    quality: QUALITY,
                    maxWidth: MAX_WIDTH,
                    maxHeight: MAX_HEIGHT,
                    removeMetadata: true
                }
            );
            
            const extension = originalFilename.split('.').pop().toLowerCase();
            const outputExtension = extension === 'jpg' ? 'jpg' : extension;
            
            conversionResult = {
                buffer: processedBuffer,
                filename: `${originalFilename.split('.')[0]}_optimized.${outputExtension}`,
                mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
                originalFormat: extension,
                outputFormat: extension
            };
        }
        
        console.log(`📊 Optimized file size: ${(conversionResult.buffer.length / 1024 / 1024).toFixed(2)} MB`);
        const sizeReduction = Math.round((1 - conversionResult.buffer.length / imageData.sizeInBytes) * 100);
        console.log(`📊 Size reduction: ${sizeReduction}%`);
        
        // Upload the optimized image
        const newImageUrl = await uploadOptimizedImage(
            conversionResult.buffer,
            conversionResult.filename,
            conversionResult.mimeType
        );
        
        // Delete the old image
        await deleteOldImage(imageData.url);
        
        console.log(`✅ ${isHeic ? 'Conversion' : 'Optimization'} completed: ${originalFilename} -> ${conversionResult.filename}`);
        return {
            oldUrl: imageData.url,
            newUrl: newImageUrl,
            sizeReduction: sizeReduction,
            type: isHeic ? 'HEIC_CONVERSION' : 'OPTIMIZATION',
            itemName: imageData.itemName,
            itemId: imageData.itemId
        };
        
    } catch (error) {
        console.error(`❌ Failed to process image ${imageData.url}:`, error.message);
        return null;
    }
}

async function uploadOptimizedImage(buffer, filename, mimeType) {
    try {
        console.log(`📤 Uploading optimized image: ${filename}`);
        
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
        console.log(`✅ Upload successful: ${newImageUrl}`);
        
        return newImageUrl;
    } catch (error) {
        console.error(`❌ Error uploading optimized image:`, error);
        throw error;
    }
}

async function deleteOldImage(imageUrl) {
    try {
        const urlParts = imageUrl.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
            console.warn(`Cannot delete image with invalid URL: ${imageUrl}`);
            return;
        }
        
        const filePath = urlParts[1];
        console.log(`🗑️ Deleting old image: ${filePath}`);
        
        const { error } = await supabase.storage
            .from('furniture-images')
            .remove([filePath]);
        
        if (error) {
            console.warn(`Failed to delete old image ${filePath}:`, error.message);
        } else {
            console.log(`✅ Old image deleted: ${filePath}`);
        }
    } catch (error) {
        console.warn(`Error deleting old image:`, error);
    }
}

async function updateDatabaseImageUrls(oldUrl, newUrl) {
    try {
        console.log(`🔄 Updating database: ${oldUrl.split('/').pop()} -> ${newUrl.split('/').pop()}`);
        
        // Find items with the old URL
        const { data: items, error: searchError } = await supabase
            .from('marketplace_furniture')
            .select('id, name, image_urls')
            .not('image_urls', 'is', null);
        
        if (searchError) {
            throw new Error(`Database search failed: ${searchError.message}`);
        }
        
        const itemsToUpdate = items.filter(item => {
            if (!item.image_urls || !Array.isArray(item.image_urls)) return false;
            return item.image_urls.includes(oldUrl);
        });
        
        console.log(`📋 Found ${itemsToUpdate.length} items to update`);
        
        for (const item of itemsToUpdate) {
            const updatedImageUrls = item.image_urls.map(url => url === oldUrl ? newUrl : url);
            
            const { error: updateError } = await supabase
                .from('marketplace_furniture')
                .update({
                    image_urls: updatedImageUrls,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
            
            if (updateError) {
                console.error(`❌ Failed to update item ${item.name}:`, updateError);
            } else {
                console.log(`✅ Updated item: ${item.name}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Database update failed:`, error);
        throw error;
    }
}

async function optimizeAllLargeImages() {
    console.log(`🚀 Starting dynamic image optimization (threshold: ${SIZE_THRESHOLD_MB}MB)...\n`);
    
    // Find all large images
    const largeImages = await findLargeImages();
    
    if (largeImages.length === 0) {
        console.log('✅ No large images found that need optimization!');
        console.log('🎉 All your marketplace images are already optimized!');
        return;
    }
    
    console.log(`\n📸 Processing ${largeImages.length} large images...\n`);
    
    let successCount = 0;
    let failureCount = 0;
    let totalSizeReduction = 0;
    const results = [];
    
    for (let i = 0; i < largeImages.length; i++) {
        const imageData = largeImages[i];
        console.log(`\n📸 Processing image ${i + 1}/${largeImages.length}: ${imageData.itemName}`);
        
        try {
            const result = await optimizeImage(imageData);
            
            if (result) {
                await updateDatabaseImageUrls(result.oldUrl, result.newUrl);
                successCount++;
                totalSizeReduction += result.sizeReduction;
                results.push(result);
            } else {
                failureCount++;
            }
            
        } catch (error) {
            console.error(`❌ Failed to process ${imageData.url}:`, error.message);
            failureCount++;
        }
        
        // Add delay between conversions to avoid overwhelming the system
        if (i < largeImages.length - 1) {
            console.log('⏳ Waiting 2 seconds before next image...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n🎉 DYNAMIC IMAGE OPTIMIZATION COMPLETED!');
    console.log(`✅ Successfully processed: ${successCount} images`);
    console.log(`❌ Failed to process: ${failureCount} images`);
    
    if (successCount > 0) {
        console.log(`📊 Average size reduction: ${Math.round(totalSizeReduction / successCount)}%`);
        
        const heicConversions = results.filter(r => r.type === 'HEIC_CONVERSION').length;
        const optimizations = results.filter(r => r.type === 'OPTIMIZATION').length;
        
        console.log(`📱 HEIC conversions: ${heicConversions}`);
        console.log(`🔧 Image optimizations: ${optimizations}`);
        
        console.log('\n🎯 Your marketplace images now:');
        console.log('   ✅ Display correctly on all devices and browsers');
        console.log('   ✅ Load much faster (smaller file sizes)');
        console.log('   ✅ Use less storage space');
        console.log('   ✅ Provide better user experience');
        
        console.log('\n💡 Future uploads will be automatically optimized!');
    }
}

// Add manual URL option
async function optimizeSpecificUrls(urls) {
    console.log(`🚀 Starting optimization of ${urls.length} specific images...\n`);
    
    let successCount = 0;
    let failureCount = 0;
    let totalSizeReduction = 0;
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
        const imageUrl = urls[i];
        console.log(`\n📸 Processing image ${i + 1}/${urls.length}`);
        
        try {
            const sizeInfo = await getImageSize(imageUrl);
            if (!sizeInfo) {
                console.log(`❌ Could not access image: ${imageUrl}`);
                failureCount++;
                continue;
            }
            
            const imageData = {
                url: imageUrl,
                ...sizeInfo,
                itemName: 'Manual Upload',
                itemId: 'manual'
            };
            
            const result = await optimizeImage(imageData);
            
            if (result) {
                await updateDatabaseImageUrls(result.oldUrl, result.newUrl);
                successCount++;
                totalSizeReduction += result.sizeReduction;
                results.push(result);
            } else {
                failureCount++;
            }
            
        } catch (error) {
            console.error(`❌ Failed to process ${imageUrl}:`, error.message);
            failureCount++;
        }
        
        // Add delay between conversions
        if (i < urls.length - 1) {
            console.log('⏳ Waiting 2 seconds before next image...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n🎉 MANUAL IMAGE OPTIMIZATION COMPLETED!');
    console.log(`✅ Successfully processed: ${successCount} images`);
    console.log(`❌ Failed to process: ${failureCount} images`);
    
    if (successCount > 0) {
        console.log(`📊 Average size reduction: ${Math.round(totalSizeReduction / successCount)}%`);
    }
}

// Command line arguments handling
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === '--manual') {
    // Manual mode with specific URLs
    const manualUrls = args.slice(1);
    if (manualUrls.length === 0) {
        console.log('❌ Please provide URLs after --manual flag');
        console.log('Usage: node optimize-any-large-images.js --manual <url1> <url2> ...');
        process.exit(1);
    }
    optimizeSpecificUrls(manualUrls).catch(console.error);
} else {
    // Auto mode - find and optimize all large images
    optimizeAllLargeImages().catch(console.error);
} 