import express from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import supabasePricingService from '../services/supabasePricingService.js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.'));
    }
  }
});

/**
 * Create a new transportation request with image upload to Supabase
 */
router.post('/create', upload.fields([
  { name: 'studentId', maxCount: 1 },
  { name: 'itemImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      pickupLocation,
      dropoffLocation,
      selectedDate,
      items,
      serviceType,
      hasStudentId,
      needsAssembly,
      needsExtraHelper,
      pickupFloors,
      dropoffFloors,
      hasElevatorPickup,
      hasElevatorDropoff,
      specialInstructions
    } = req.body;

    // Parse items if it's a string
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    // Upload images to Supabase storage
    const imageUrls = [];
    
    // Upload student ID if provided
    let studentIdUrl = null;
    if (req.files?.studentId?.[0]) {
      const studentIdFile = req.files.studentId[0];
      const fileName = `student-ids/${uuidv4()}-${studentIdFile.originalname}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('transport-images')
        .upload(fileName, studentIdFile.buffer, {
          contentType: studentIdFile.mimetype,
          cacheControl: '3600'
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('transport-images')
          .getPublicUrl(fileName);
        studentIdUrl = publicUrl;
      }
    }

    // Upload item images if provided
    if (req.files?.itemImages) {
      for (const file of req.files.itemImages) {
        const fileName = `items/${uuidv4()}-${file.originalname}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('transport-images')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600'
          });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('transport-images')
            .getPublicUrl(fileName);
          imageUrls.push(publicUrl);
        }
      }
    }

    // Calculate pricing using Supabase pricing service
    const pricingInput = {
      serviceType,
      pickupLocation: JSON.parse(pickupLocation),
      dropoffLocation: JSON.parse(dropoffLocation),
      selectedDate,
      items: parsedItems,
      hasStudentId: hasStudentId === 'true',
      needsAssembly: needsAssembly === 'true',
      needsExtraHelper: needsExtraHelper === 'true',
      pickupFloors: parseInt(pickupFloors) || 0,
      dropoffFloors: parseInt(dropoffFloors) || 0,
      hasElevatorPickup: hasElevatorPickup === 'true',
      hasElevatorDropoff: hasElevatorDropoff === 'true',
      daysUntilMove: Math.ceil((new Date(selectedDate) - new Date()) / (1000 * 60 * 60 * 24))
    };

    const pricingBreakdown = await supabasePricingService.calculatePricing(pricingInput);

    // Store transportation request in database
    const { data: request, error: insertError } = await supabase
      .from('transportation_requests')
      .insert({
        customer_name: customerName,
        email,
        phone,
        pickup_location: JSON.parse(pickupLocation),
        dropoff_location: JSON.parse(dropoffLocation),
        selected_date: selectedDate,
        items: parsedItems,
        service_type: serviceType,
        has_student_id: hasStudentId === 'true',
        student_id_url: studentIdUrl,
        needs_assembly: needsAssembly === 'true',
        needs_extra_helper: needsExtraHelper === 'true',
        pickup_floors: parseInt(pickupFloors) || 0,
        dropoff_floors: parseInt(dropoffFloors) || 0,
        has_elevator_pickup: hasElevatorPickup === 'true',
        has_elevator_dropoff: hasElevatorDropoff === 'true',
        special_instructions: specialInstructions,
        item_image_urls: imageUrls,
        pricing_breakdown: pricingBreakdown,
        total_price: pricingBreakdown.total,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    res.json({
      success: true,
      data: {
        requestId: request.id,
        pricing: pricingBreakdown,
        imageUrls,
        studentIdUrl
      }
    });

  } catch (error) {
    console.error('Error creating transportation request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create transportation request',
      message: error.message
    });
  }
});

/**
 * Get transportation requests for admin with image URLs
 */
router.get('/admin/requests', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    let query = supabase
      .from('transportation_requests')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    const { data: requests, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching transportation requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transportation requests',
      message: error.message
    });
  }
});

/**
 * Update transportation request status
 */
router.patch('/admin/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const { data: request, error } = await supabase
      .from('transportation_requests')
      .update({
        status,
        admin_notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: request
    });

  } catch (error) {
    console.error('Error updating transportation request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update transportation request',
      message: error.message
    });
  }
});

/**
 * Calculate pricing endpoint (uses Supabase pricing service)
 */
router.post('/calculate-price', async (req, res) => {
  try {
    const pricingBreakdown = await supabasePricingService.calculatePricing(req.body);
    
    res.json({
      success: true,
      data: pricingBreakdown
    });

  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate price',
      message: error.message
    });
  }
});

export default router;
