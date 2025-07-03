const sharp = require('sharp');
const fs = require('fs');

async function testCompression() {
    try {
        console.log('🧪 Testing Sharp compression...');
        
        // Create a test image (solid color, 2000x2000 pixels)
        const testImage = await sharp({
            create: {
                width: 2000,
                height: 2000,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .jpeg({ quality: 100 })
        .toBuffer();
        
        console.log(`📊 Original test image size: ${(testImage.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Test compression
        const compressed = await sharp(testImage)
            .jpeg({ quality: 70 })
            .resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
            .toBuffer();
        
        console.log(`📊 Compressed image size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Test aggressive compression
        const aggressiveCompressed = await sharp(testImage)
            .jpeg({ quality: 30 })
            .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
            .toBuffer();
        
        console.log(`📊 Aggressively compressed image size: ${(aggressiveCompressed.length / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('✅ Sharp compression test completed successfully!');
        
    } catch (error) {
        console.error('❌ Sharp compression test failed:', error.message);
    }
}

testCompression(); 