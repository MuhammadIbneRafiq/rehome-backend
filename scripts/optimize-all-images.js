import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import imageProcessingService from '../services/imageProcessingService.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://yhlenudckwewmejigxvl.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobGVudWRja3dld21lamlneHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyMTk0MDgsImV4cCI6MjA1Mjc5NTQwOH0.CaNKgZXfhkT9-FaGF5hhqQ3aavfUi32R-1ueew8B-S0";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// All problematic images from the analysis
const problematicImages = [
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/0fa746cd-ee93-4ffc-81a4-353f74e555c3.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/5ac28d42-17ea-4ed8-81fb-d62151f3e1af.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/110fec90-ac6e-4e00-b05c-29f39ec06070.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/93ab8dda-8066-4de0-a05c-15aedf9cde5d.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/75c9e625-3c94-4c5f-a1b7-a63eb2eeaffc.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/841c4242-a3b9-4033-996f-c8dbb21e1e0f.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/9884c55e-2b75-477a-9cec-4fd6249410c7.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/22906d3f-92c9-4067-9414-45cd317e4038.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/d0e4a4ef-f893-4b1b-b7c5-8b56cab9ed21.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/775bca5a-b888-4fd9-b6d2-ae2cec094bf6.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/36dbc761-89f2-43fc-a4b7-f777d930ecae.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/557708c7-659c-47df-bc52-49f99eac89df.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/890f9479-d83d-444b-b646-a3172ec3008e.jpg",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/d59fdd50-fae7-4934-9d97-5bb9120a65d1.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/6f9714d0-8053-487b-a410-ed0e306e1261.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/3a1afa5c-01da-4ef1-a942-37826eb027cc.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/c5fbbbd2-e195-4e8d-8705-c350415c4744.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/3f39bf66-98c7-4672-9f96-3816607b8056.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/3dfbebec-76bd-4e52-8f1e-74f3c51e5816.HEIC",
    "https://yhlenudckwewmejigxvl.supabase.co/storage/v1/object/public/furniture-images/d4ebcf21-1e05-4417-96c6-ae95f7b15d44.HEIC"
];

async function downloadImageFromStorage(imageUrl) {
    try {
        const urlParts = imageUrl.split('/storage/v1/object/public/furniture-images/');
        if (urlParts.length !== 2) {
            throw new Error(`Invalid Supabase storage URL: ${imageUrl}`);
        }
        
        const filePath = urlParts[1];
        console.log(`📥 Downloading: ${filePath}`);
        
        const { data, error } = await supabase.storage
            .from('furniture-images')
            .download(filePath);
        
        if (error) {
            throw new Error(`Failed to download ${filePath}: ${error.message}`);
        }
        
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`❌ Error downloading ${imageUrl}:`, error);
        throw error;
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

async function optimizeImage(imageUrl) {
    try {
        const isHeic = imageUrl.toLowerCase().includes('.heic');
        const originalFilename = imageUrl.split('/').pop();
        
        console.log(`\n🔄 ${isHeic ? 'Converting HEIC' : 'Optimizing'} image: ${originalFilename}`);
        
        // Download the original image
        const originalBuffer = await downloadImageFromStorage(imageUrl);
        console.log(`📊 Original file size: ${(originalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Process the image
        let conversionResult;
        if (isHeic) {
            // Convert HEIC to JPEG
            conversionResult = await imageProcessingService.convertImageToWebFormat(
                originalBuffer,
                originalFilename,
                {
                    quality: 85,
                    maxWidth: 1920,
                    maxHeight: 1080
                }
            );
        } else {
            // Optimize existing JPEG/PNG
            const processedBuffer = await imageProcessingService.processImageWithSharp(
                originalBuffer,
                {
                    format: originalFilename.toLowerCase().includes('.png') ? 'png' : 'jpeg',
                    quality: 85,
                    maxWidth: 1920,
                    maxHeight: 1080,
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
        const sizeReduction = Math.round((1 - conversionResult.buffer.length / originalBuffer.length) * 100);
        console.log(`📊 Size reduction: ${sizeReduction}%`);
        
        // Upload the optimized image
        const newImageUrl = await uploadOptimizedImage(
            conversionResult.buffer,
            conversionResult.filename,
            conversionResult.mimeType
        );
        
        // Delete the old image
        await deleteOldImage(imageUrl);
        
        console.log(`✅ ${isHeic ? 'Conversion' : 'Optimization'} completed: ${originalFilename} -> ${conversionResult.filename}`);
        return {
            oldUrl: imageUrl,
            newUrl: newImageUrl,
            sizeReduction: sizeReduction,
            type: isHeic ? 'HEIC_CONVERSION' : 'OPTIMIZATION'
        };
        
    } catch (error) {
        console.error(`❌ Failed to process image ${imageUrl}:`, error.message);
        return null;
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

async function optimizeAllImages() {
    console.log('🚀 Starting comprehensive image optimization process...\n');
    console.log(`📊 Processing ${problematicImages.length} problematic images\n`);
    
    let successCount = 0;
    let failureCount = 0;
    let totalSizeReduction = 0;
    const results = [];
    
    for (let i = 0; i < problematicImages.length; i++) {
        const imageUrl = problematicImages[i];
        console.log(`\n📸 Processing image ${i + 1}/${problematicImages.length}`);
        
        try {
            const result = await optimizeImage(imageUrl);
            
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
        
        // Add delay between conversions to avoid overwhelming the system
        if (i < problematicImages.length - 1) {
            console.log('⏳ Waiting 2 seconds before next image...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n🎉 IMAGE OPTIMIZATION COMPLETED!');
    console.log(`✅ Successfully processed: ${successCount} images`);
    console.log(`❌ Failed to process: ${failureCount} images`);
    console.log(`📊 Average size reduction: ${Math.round(totalSizeReduction / successCount)}%`);
    
    const heicConversions = results.filter(r => r.type === 'HEIC_CONVERSION').length;
    const optimizations = results.filter(r => r.type === 'OPTIMIZATION').length;
    
    console.log(`📱 HEIC conversions: ${heicConversions}`);
    console.log(`🔧 Image optimizations: ${optimizations}`);
    
    if (successCount > 0) {
        console.log('\n🎯 Your marketplace images should now:');
        console.log('   ✅ Display correctly on all devices and browsers');
        console.log('   ✅ Load much faster (smaller file sizes)');
        console.log('   ✅ Use less storage space');
        console.log('   ✅ Provide better user experience');
        
        console.log('\n💡 All future uploads will be automatically optimized!');
    }
}

// Run the optimization
optimizeAllImages().catch(console.error); 