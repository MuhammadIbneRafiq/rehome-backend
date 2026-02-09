import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import supabasePricingService from '../services/supabasePricingService.js';
import { supabaseClient } from '../db/params.js';

const router = express.Router();

// Use shared Supabase client
const supabase = supabaseClient;

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
  { name: 'storeProofPhoto', maxCount: 1 },
  { name: 'itemImages', maxCount: 10 }
]), async (req, res) => {
  console.log('[DEBUG] ====== TRANSPORT CREATE REQUEST ======');
  console.log('[DEBUG] req.files:', req.files);
  console.log('[DEBUG] req.files keys:', req.files ? Object.keys(req.files) : 'NO FILES');
  console.log('[DEBUG] req.body keys:', Object.keys(req.body));
  console.log('[DEBUG] req.body:', JSON.stringify(req.body, null, 2));
  
  try {
    const {
      customerName,
      email,
      phone,
      pickupLocation,
      dropoffLocation,
      selectedDate,
      selectedDateStart,
      selectedDateEnd,
      pickupDate,
      dropoffDate,
      isDateFlexible,
      dateOption,
      items,
      serviceType,
      hasStudentId,
      needsAssembly,
      needsExtraHelper,
      pickupFloors,
      dropoffFloors,
      hasElevatorPickup,
      hasElevatorDropoff,
      specialInstructions,
      customItem,
      preferredTimeSpan,
      pricingBreakdown,
      assemblyItems,
      disassemblyItems,
      extraHelperItems,
      carryingServiceItems,
      carryingUpItems,
      carryingDownItems
    } = req.body;
    
    console.log('[DEBUG] Parsed values:', {
      customerName,
      email,
      serviceType,
      isDateFlexible,
      selectedDate,
      pickupDate,
      dropoffDate
    });

    // Parse items if it's a string
    console.log('[PRICING DEBUG] Raw items received:', items);
    console.log('[PRICING DEBUG] Items type:', typeof items);
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    console.log('[PRICING DEBUG] Parsed items:', JSON.stringify(parsedItems, null, 2));
    
    // Calculate total item points for debugging
    if (parsedItems && Array.isArray(parsedItems)) {
      const totalPoints = parsedItems.reduce((sum, item) => sum + (item.points || 0), 0);
      console.log('[PRICING DEBUG] Total item points:', totalPoints);
      console.log('[PRICING DEBUG] Item details:', parsedItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        points: item.points,
        totalPoints: item.points * item.quantity
      })));
    }

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

      if (uploadError) {
        console.error('[STUDENT ID UPLOAD ERROR]', uploadError);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('transport-images')
          .getPublicUrl(fileName);
        studentIdUrl = publicUrl;
        console.log('[STUDENT ID] Successfully uploaded:', publicUrl);
      }
    }

    // Upload store proof photo if provided
    let storeProofUrl = null;
    if (req.files?.storeProofPhoto?.[0]) {
      const storeProofFile = req.files.storeProofPhoto[0];
      const fileName = `store-proofs/${uuidv4()}-${storeProofFile.originalname}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('transport-images')
        .upload(fileName, storeProofFile.buffer, {
          contentType: storeProofFile.mimetype,
          cacheControl: '3600'
        });

      if (uploadError) {
        console.error('[STORE PROOF UPLOAD ERROR]', uploadError);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('transport-images')
          .getPublicUrl(fileName);
        storeProofUrl = publicUrl;
        console.log('[STORE PROOF] Successfully uploaded:', publicUrl);
      }
    }

    // Upload item images if provided
    console.log('[IMAGE UPLOAD] Checking for item images...');
    console.log('[IMAGE UPLOAD] req.files:', req.files);
    console.log('[IMAGE UPLOAD] req.files?.itemImages:', req.files?.itemImages);
    
    if (req.files?.itemImages) {
      console.log(`[IMAGE UPLOAD] Found ${req.files.itemImages.length} item images to upload`);
      for (const file of req.files.itemImages) {
        const fileName = `items/${uuidv4()}-${file.originalname}`;
        console.log(`[IMAGE UPLOAD] Uploading: ${fileName} (${file.size} bytes, ${file.mimetype})`);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('transport-images')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600'
          });

        if (uploadError) {
          console.error('[IMAGE UPLOAD ERROR]', uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('transport-images')
            .getPublicUrl(fileName);
          console.log(`[IMAGE UPLOAD] Successfully uploaded: ${publicUrl}`);
          imageUrls.push(publicUrl);
        }
      }
    } else {
      console.log('[IMAGE UPLOAD] No item images found in request');
    }
    
    console.log('[IMAGE UPLOAD] Final imageUrls array:', imageUrls);

    // Parse location data - they come as JSON strings from FormData
    console.log('[DEBUG] Parsing pickupLocation:', pickupLocation);
    console.log('[DEBUG] Parsing dropoffLocation:', dropoffLocation);
    
    let parsedPickupLocation;
    let parsedDropoffLocation;
    
    try {
      parsedPickupLocation = typeof pickupLocation === 'string' ? JSON.parse(pickupLocation) : pickupLocation;
      parsedDropoffLocation = typeof dropoffLocation === 'string' ? JSON.parse(dropoffLocation) : dropoffLocation;
    } catch (parseError) {
      console.error('[ERROR] Failed to parse location data:', parseError);
      throw new Error('Invalid location data format');
    }
    
    console.log('[DEBUG] Parsed pickup city:', parsedPickupLocation?.city);
    console.log('[DEBUG] Parsed dropoff city:', parsedDropoffLocation?.city);
    
    const pricingInput = {
      serviceType,
      pickupLocation: parsedPickupLocation,
      dropoffLocation: parsedDropoffLocation,
      selectedDate,
      pickupDate: pickupDate || selectedDate,
      dropoffDate: dropoffDate || selectedDate,
      isDateFlexible: isDateFlexible === 'true',
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
    
    console.log('[PRICING DEBUG] pricingInput for create:', JSON.stringify(pricingInput, null, 2));
    //commented because the one before its being passed from the frontend
    // const pricingBreakdown = await supabasePricingService.calculatePricing(pricingInput); 
    console.log('[PRICING DEBUG] pricingBreakdown result:', JSON.stringify(pricingBreakdown, null, 2));
    console.log('[PRICING DEBUG] Item value specifically:', pricingBreakdown.itemValue);
    console.log('[PRICING DEBUG] Base price specifically:', pricingBreakdown.basePrice);
    console.log('[PRICING DEBUG] Total price specifically:', pricingBreakdown.total);

    // Generate order number
    const orderNumber = `TRN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // Prepare data for insertion - match exact column names in transportation_requests table
    // Use selectedDateStart/selectedDateEnd directly from frontend
    // For 'rehome' option, dates are determined by ReHome - leave them null
    const finalDateStart = dateOption === 'rehome' ? null : (selectedDateStart || pickupDate || selectedDate || null);
    const finalDateEnd = dateOption === 'rehome' ? null : (selectedDateEnd || dropoffDate || null);
    
    console.log('[DATE DEBUG] dateOption:', dateOption, 'selectedDateStart:', selectedDateStart, 'selectedDateEnd:', selectedDateEnd, 'finalDateStart:', finalDateStart, 'finalDateEnd:', finalDateEnd);

    // Parse JSON fields if they're strings
    const parsedPricingBreakdown = typeof pricingBreakdown === 'string' ? JSON.parse(pricingBreakdown) : pricingBreakdown;
    const parsedAssemblyItems = typeof assemblyItems === 'string' ? JSON.parse(assemblyItems) : assemblyItems;
    const parsedDisassemblyItems = typeof disassemblyItems === 'string' ? JSON.parse(disassemblyItems) : disassemblyItems;
    const parsedExtraHelperItems = typeof extraHelperItems === 'string' ? JSON.parse(extraHelperItems) : extraHelperItems;
    const parsedCarryingServiceItems = typeof carryingServiceItems === 'string' ? JSON.parse(carryingServiceItems) : carryingServiceItems;
    const parsedCarryingUpItems = typeof carryingUpItems === 'string' ? JSON.parse(carryingUpItems) : carryingUpItems;
    const parsedCarryingDownItems = typeof carryingDownItems === 'string' ? JSON.parse(carryingDownItems) : carryingDownItems;
    
    // Add all the item selections to the pricing breakdown JSONB
    const enhancedPricingBreakdown = {
      ...parsedPricingBreakdown,
      // Store item selections within pricing_breakdown
      assemblyItems: parsedAssemblyItems,
      disassemblyItems: parsedDisassemblyItems,
      extraHelperItems: parsedExtraHelperItems,
      carryingServiceItems: parsedCarryingServiceItems,
      carryingUpItems: parsedCarryingUpItems,
      carryingDownItems: parsedCarryingDownItems
    };
    
    const insertData = {
      order_number: orderNumber,
      customer_name: customerName,
      email: email,
      phone,
      pickup_location: parsedPickupLocation,
      dropoff_location: parsedDropoffLocation,
      selected_date: selectedDate,
      selecteddate_start: finalDateStart,
      selecteddate_end: finalDateEnd,
      date_option: dateOption || 'fixed',
      items: parsedItems,
      service_type: serviceType,
      has_student_id: hasStudentId === 'true',
      student_id_url: studentIdUrl,
      store_proof_url: storeProofUrl,
      needs_assembly: needsAssembly === 'true',
      needs_extra_helper: needsExtraHelper === 'true',
      pickup_floors: parseInt(pickupFloors) || 0,
      dropoff_floors: parseInt(dropoffFloors) || 0,
      has_elevator_pickup: hasElevatorPickup === 'true',
      has_elevator_dropoff: hasElevatorDropoff === 'true',
      special_instructions: specialInstructions || '',
      custom_item: customItem || null,
      preferred_time_span: preferredTimeSpan || null,
      item_image_urls: imageUrls,
      pricing_breakdown: enhancedPricingBreakdown,
      total_price: enhancedPricingBreakdown?.total || 0,
      status: 'pending'
    };
    
    console.log('[DATABASE] Attempting to insert transportation request:');
    console.log('[DATABASE] Insert data:', JSON.stringify(insertData, null, 2));
    
    // Store transportation request in database
    const { data: request, error: insertError } = await supabase
      .from('transportation_requests')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[DATABASE ERROR] Failed to insert transportation request:');
      console.error('[DATABASE ERROR] Error details:', insertError);
      console.error('[DATABASE ERROR] Error message:', insertError.message);
      console.error('[DATABASE ERROR] Error code:', insertError.code);
      console.error('[DATABASE ERROR] Error hint:', insertError.hint);
      console.error('[DATABASE ERROR] Error details:', insertError.details);
      throw new Error(`Database insertion failed: ${insertError.message || 'Unknown error'}`);
    }
    
    console.log('[DATABASE] Successfully inserted transportation request with ID:', request?.id);

    // Send confirmation email
    try {
      const { sendMovingRequestEmail } = await import('../notif.js');
      
      const orderSummary = {
        pickupDetails: {
          address: parsedPickupLocation?.displayName || parsedPickupLocation?.text || 'Unknown',
          floor: parseInt(pickupFloors) || 0,
          elevator: hasElevatorPickup === 'true'
        },
        deliveryDetails: {
          address: parsedDropoffLocation?.displayName || parsedDropoffLocation?.text || 'Unknown',
          floor: parseInt(dropoffFloors) || 0,
          elevator: hasElevatorDropoff === 'true'
        },
        schedule: {
          dateOption: dateOption || 'fixed',
          date: dateOption === 'rehome' ? 'ReHome Chooses' : 
                dateOption === 'flexible' ? `Flexible: ${finalDateStart ? new Date(finalDateStart).toLocaleDateString() : ''} - ${finalDateEnd ? new Date(finalDateEnd).toLocaleDateString() : ''}` :
                `${finalDateStart ? new Date(finalDateStart).toLocaleDateString() : (selectedDate ? new Date(selectedDate).toLocaleDateString() : 'To be determined')}${finalDateEnd && finalDateEnd !== finalDateStart ? ' - ' + new Date(finalDateEnd).toLocaleDateString() : ''}`,
          time: preferredTimeSpan === 'morning' ? 'Morning (8:00 - 12:00)' :
                preferredTimeSpan === 'afternoon' ? 'Afternoon (12:00 - 16:00)' :
                preferredTimeSpan === 'evening' ? 'Evening (16:00 - 20:00)' :
                preferredTimeSpan === 'anytime' ? 'Anytime' : 'To be determined',
          preferredTimeSpan: preferredTimeSpan || null
        },
        items: parsedItems || [],
        basePrice: parsedPricingBreakdown?.basePrice || 0,
        distanceCost: parsedPricingBreakdown?.distanceCost || 0,
        distanceKm: parsedPricingBreakdown?.breakdown?.distance?.distanceKm || 0,
        itemsCost: parsedPricingBreakdown?.itemValue || 0,
        additionalServices: {
          assembly: parsedPricingBreakdown?.assemblyCost || 0,
          assemblyBreakdown: parsedPricingBreakdown?.breakdown?.assembly?.itemBreakdown || [],
          carrying: parsedPricingBreakdown?.carryingCost || 0,
          carryingBreakdown: parsedPricingBreakdown?.breakdown?.carrying?.itemBreakdown || [],
          extraHelper: parsedPricingBreakdown?.extraHelperCost || 0,
          studentDiscount: parsedPricingBreakdown?.studentDiscount || 0
        },
        lateBookingFee: parsedPricingBreakdown?.lateBookingFee || 0,
        totalPrice: parsedPricingBreakdown?.total || 0,
        contactInfo: {
          name: customerName,
          email: email,
          phone: phone
        }
      };

      const emailResult = await sendMovingRequestEmail({
        customerEmail: email,
        customerFirstName: customerName.split(' ')[0] || 'Customer',
        customerLastName: customerName.split(' ')[1] || '',
        serviceType: serviceType === 'item-transport' ? 'item-moving' : 'house-moving',
        pickupLocation: parsedPickupLocation,
        dropoffLocation: parsedDropoffLocation,
        selectedDateRange: { start: finalDateStart || selectedDate, end: finalDateEnd || finalDateStart || selectedDate },
        dateOption: dateOption || 'fixed',
        preferredTimeSpan: preferredTimeSpan || null,
        isDateFlexible: isDateFlexible === 'true',
        estimatedPrice: parsedPricingBreakdown?.total || 0,
        orderSummary,
        order_number: orderNumber,
        pricingBreakdown: parsedPricingBreakdown
      });

      if (emailResult.success) {
        console.log('[EMAIL] Confirmation email sent successfully');
      } else {
        console.error('[EMAIL ERROR] Failed to send confirmation email:', emailResult.error);
      }
    } catch (emailError) {
      console.error('[EMAIL ERROR] Exception sending confirmation email:', emailError);
      // Don't fail the request if email fails
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
    console.log('[PRICING DEBUG] Calculate price request body:', JSON.stringify(req.body, null, 2));
    console.log('[PRICING DEBUG] Items in request:', req.body.items);
    console.log('[PRICING DEBUG] Item quantities:', req.body.itemQuantities);
    
    const pricingBreakdown = await supabasePricingService.calculatePricing(req.body);
    
    console.log('[PRICING DEBUG] Calculate price response:', JSON.stringify(pricingBreakdown, null, 2));
    console.log('[PRICING DEBUG] Item value in response:', pricingBreakdown.itemValue);
    console.log('[PRICING DEBUG] Total price in response:', pricingBreakdown.total);
    
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
