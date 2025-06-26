import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { v4 as uuidv4 } from 'uuid';

// Supported web image formats
const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
const UNSUPPORTED_FORMATS = ['heic', 'heif', 'tiff', 'tif', 'bmp'];

/**
 * Check if image format is supported by web browsers
 * @param {string} filename - Original filename
 * @returns {boolean} - True if supported, false if needs conversion
 */
export const isImageFormatSupported = (filename) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return SUPPORTED_FORMATS.includes(extension);
};

/**
 * Get file extension from filename
 * @param {string} filename - Original filename
 * @returns {string} - File extension in lowercase
 */
export const getFileExtension = (filename) => {
    return filename.split('.').pop()?.toLowerCase() || '';
};

/**
 * Convert HEIC/HEIF images to JPEG
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Buffer>} - Converted JPEG buffer
 */
export const convertHeicToJpeg = async (buffer) => {
    try {
        console.log('Converting HEIC/HEIF to JPEG...');
        const outputBuffer = await heicConvert({
            buffer: buffer,
            format: 'JPEG',
            quality: 0.9 // 90% quality
        });
        console.log('HEIC conversion successful');
        return Buffer.from(outputBuffer);
    } catch (error) {
        console.error('HEIC conversion failed:', error);
        throw new Error(`Failed to convert HEIC image: ${error.message}`);
    }
};

/**
 * Process and optimize image using Sharp
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Buffer>} - Processed image buffer
 */
export const processImageWithSharp = async (buffer, options = {}) => {
    try {
        const {
            format = 'jpeg',
            quality = 85,
            maxWidth = 1920,
            maxHeight = 1080,
            removeMetadata = true
        } = options;

        console.log(`Processing image with Sharp: format=${format}, quality=${quality}`);
        
        let sharpInstance = sharp(buffer);
        
        // Remove metadata for privacy and smaller file size
        if (removeMetadata) {
            sharpInstance = sharpInstance.withMetadata(false);
        }
        
        // Resize if image is too large
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
        });
        
        // Convert to specified format with quality settings
        switch (format) {
            case 'jpeg':
            case 'jpg':
                sharpInstance = sharpInstance.jpeg({ quality, progressive: true });
                break;
            case 'png':
                sharpInstance = sharpInstance.png({ quality, progressive: true });
                break;
            case 'webp':
                sharpInstance = sharpInstance.webp({ quality });
                break;
            default:
                sharpInstance = sharpInstance.jpeg({ quality, progressive: true });
        }
        
        const processedBuffer = await sharpInstance.toBuffer();
        console.log(`Sharp processing completed. Original: ${buffer.length} bytes, Processed: ${processedBuffer.length} bytes`);
        
        return processedBuffer;
    } catch (error) {
        console.error('Sharp processing failed:', error);
        throw new Error(`Failed to process image: ${error.message}`);
    }
};

/**
 * Main function to convert any image to web-compatible format
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalFilename - Original filename
 * @param {Object} options - Conversion options
 * @returns {Promise<{buffer: Buffer, filename: string, mimeType: string}>}
 */
export const convertImageToWebFormat = async (buffer, originalFilename, options = {}) => {
    try {
        const extension = getFileExtension(originalFilename);
        const baseName = originalFilename.split('.').slice(0, -1).join('.');
        const newBaseName = baseName || 'image';
        
        console.log(`Converting image: ${originalFilename} (${extension})`);
        
        let processedBuffer = buffer;
        let outputFormat = 'jpeg';
        
        // Handle HEIC/HEIF conversion first
        if (['heic', 'heif'].includes(extension)) {
            processedBuffer = await convertHeicToJpeg(buffer);
            outputFormat = 'jpeg';
        }
        // Handle other unsupported formats
        else if (UNSUPPORTED_FORMATS.includes(extension)) {
            // Sharp can handle most formats, so we'll process with Sharp
            outputFormat = 'jpeg';
        }
        // Handle supported formats - still optimize them
        else if (SUPPORTED_FORMATS.includes(extension)) {
            outputFormat = extension === 'jpg' ? 'jpeg' : extension;
        }
        
        // Process with Sharp for optimization
        const finalOptions = {
            format: outputFormat,
            quality: options.quality || 85,
            maxWidth: options.maxWidth || 1920,
            maxHeight: options.maxHeight || 1080,
            removeMetadata: options.removeMetadata !== false
        };
        
        const finalBuffer = await processImageWithSharp(processedBuffer, finalOptions);
        
        // Generate new filename
        const outputExtension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
        const newFilename = `${uuidv4()}.${outputExtension}`;
        const mimeType = `image/${outputFormat === 'jpeg' ? 'jpeg' : outputFormat}`;
        
        console.log(`Image conversion completed: ${originalFilename} -> ${newFilename}`);
        
        return {
            buffer: finalBuffer,
            filename: newFilename,
            mimeType: mimeType,
            originalFormat: extension,
            outputFormat: outputFormat
        };
    } catch (error) {
        console.error('Image conversion failed:', error);
        throw new Error(`Failed to convert image ${originalFilename}: ${error.message}`);
    }
};

/**
 * Generate thumbnail from image
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Buffer>} - Thumbnail buffer
 */
export const generateThumbnail = async (buffer, options = {}) => {
    try {
        const {
            width = 300,
            height = 300,
            quality = 80,
            format = 'jpeg'
        } = options;
        
        console.log(`Generating thumbnail: ${width}x${height}`);
        
        const thumbnail = await sharp(buffer)
            .resize(width, height, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality })
            .toBuffer();
            
        console.log(`Thumbnail generated: ${thumbnail.length} bytes`);
        return thumbnail;
    } catch (error) {
        console.error('Thumbnail generation failed:', error);
        throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
};

/**
 * Get image metadata
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} - Image metadata
 */
export const getImageMetadata = async (buffer) => {
    try {
        const metadata = await sharp(buffer).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: buffer.length,
            hasAlpha: metadata.hasAlpha,
            channels: metadata.channels
        };
    } catch (error) {
        console.error('Failed to get image metadata:', error);
        return null;
    }
};

export default {
    isImageFormatSupported,
    getFileExtension,
    convertHeicToJpeg,
    processImageWithSharp,
    convertImageToWebFormat,
    generateThumbnail,
    getImageMetadata
}; 