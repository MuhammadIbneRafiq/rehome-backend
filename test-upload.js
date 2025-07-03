const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Create a test image buffer (simulate a large file)
const createTestImage = (sizeInMB) => {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    const buffer = Buffer.alloc(sizeInBytes);
    // Fill with some data to simulate an actual image
    for (let i = 0; i < sizeInBytes; i++) {
        buffer[i] = i % 256;
    }
    return buffer;
};

async function testUpload() {
    try {
        console.log('🧪 Testing upload with large file...');
        
        // Create a simulated 5MB image
        const testImageBuffer = createTestImage(5);
        
        const formData = new FormData();
        formData.append('photos', testImageBuffer, {
            filename: 'test-5mb-image.jpg',
            contentType: 'image/jpeg'
        });
        
        console.log('📤 Sending upload request...');
        const response = await axios.post('http://localhost:3001/api/upload', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': 'Bearer your-test-token-here' // Replace with actual token
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log('✅ Upload successful!');
        console.log('Response:', response.data);
        
    } catch (error) {
        console.error('❌ Upload failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Run the test
testUpload(); 