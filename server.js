// server.js - ReHome Pricing System Backend
import dotenv from 'dotenv';
dotenv.config();

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";
import { supabaseClient } from "./db/params.js";
import express, { json } from "express";
import cors from "cors";
import multer from 'multer'; // Import multer for handling file uploads
import { v4 as uuidv4 } from 'uuid'; // Import uuid to generate unique file names
// import { sendEmail } from "./notif.js";
import { Resend } from 'resend';
import { Server } from 'socket.io';
import http from 'http';
import { createMollieClient } from '@mollie/api-client';
import { authenticateUser } from './middleware/auth.js';

const app = express();
const port = process.env.PORT || 3000;

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// CORS Configuration - Enable CORS for all routes and origins
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
}));

// Handle preflight OPTIONS requests
app.options('*', cors());

app.use(json()); // for parsing application/json

// Set up Multer for file uploads (in-memory storage for simplicity)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// List of admin email addresses - keep in sync with other admin files
const ADMIN_EMAILS = [
  'muhammadibnerafiq@gmail.com',
  'testnewuser12345@gmail.com',
  'egzmanagement@gmail.com',
  'samuel.stroehle8@gmail.com',
  'info@rehomebv.com'
];

// Helper function to check if user is admin
const isAdmin = (userEmail) => {
  return ADMIN_EMAILS.includes(userEmail);
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ success: false, error: "Authentication token is required" });
        }

        const { data: user, error } = await supabaseClient.auth.getUser(token);

        if (error || !user || !user.user) {
            return res.status(403).json({ success: false, error: "Invalid token or user not found" });
        }

        if (!isAdmin(user.user.email)) {
            return res.status(403).json({ success: false, error: "Admin access required" });
        }

        req.user = user.user;
        next();
    } catch (error) {
        console.error("Admin authentication error:", error);
        return res.status(403).json({ success: false, error: "Authentication failed" });
    }
};

// Audit logging middleware
const auditLog = async (req, res, next) => {
    try {
        const { method, originalUrl, body, params, query } = req;
        const userEmail = req.user ? req.user.email : 'anonymous';
        const timestamp = new Date().toISOString();
        
        const auditData = {
            timestamp,
            user_email: userEmail,
            action: `${method} ${originalUrl}`,
            resource_type: 'api_endpoint',
            resource_id: params.id || null,
            old_values: req.oldValues || null,
            new_values: method === 'POST' || method === 'PUT' ? body : null,
            metadata: { params, query }
        };

        // Log to console for now (you can implement database logging later)
        console.log('AUDIT LOG:', JSON.stringify(auditData, null, 2));
        
        next();
    } catch (error) {
        console.error("Audit logging error:", error);
        next(); // Continue even if audit logging fails
    }
};

// Validation schemas using Joi
const furnitureItemSchema = Joi.object({
    name: Joi.string().required(),
    category: Joi.string().required(),
    material: Joi.string(),
    dimensions: Joi.string(),
    weight: Joi.number(),
    base_points: Joi.number().required(),
    price_range_min: Joi.number(),
    price_range_max: Joi.number(),
    description: Joi.string(),
    image_url: Joi.string().uri(),
    is_active: Joi.boolean().default(true)
});

const cityBaseChargeSchema = Joi.object({
    cityName: Joi.string().required(),
    normal: Joi.number().required(),
    cityDay: Joi.number().required(),
    dayOfWeek: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required()
});

const cityDayDataSchema = Joi.object({
    cityName: Joi.string().required(),
    days: Joi.array().items(Joi.string()).required()
});

app.post("/api/mollie", async (req, res) => {
const amount = req.body.amount; // Get the amount from the request
  
  // Check if Mollie API key is available
  if (!process.env.MOLLIE_API_KEY) {
    console.error("Mollie API key not configured");
    return res.status(500).json({ error: "Payment service not configured" });
  }
  
  const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

  try {

    const payment = await mollieClient.payments.create({
    amount: {
            currency: "EUR",
            value: amount.toFixed(2) // Ensure it's formatted correctly
    },      description: `Test payment for plan`,
    redirectUrl: 'http://localhost:5173/marketplace',
    webhookUrl: 'https://067b-212-123-245-200.ngrok-free.app/mollie-webhook',
    method: 'ideal',
    });

    res.status(200).json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (error) {
    console.error("Error creating Mollie payment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
  

app.post('/api/mollie-webhook', (req, res) => {
    const paymentId = req.body.id;
    // Verify and process the payment
    // Respond with a 200 status
    console.log('here it is', paymentId)
    res.sendStatus(200);
  });
  

// Import routes
import chatRoutes from './api/chat.js';
import projectRoutes from './api/projects.js';

// --------------------  Application Routes --------------------

app.get("/api", (req, res) => {
    res.send("ReHome B.V. running successfully... 🚀");
});

// Use routes
app.use('/api/chats', chatRoutes);
app.use('/api/projects', projectRoutes);

// --------------------  Authentication Routes --------------------
// Auth
app.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Invalid request" });
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }
        if (data.session) {
            res.status(200).json({
                message: "User signed up successfully!",
                accessToken: data.session.access_token, // User will automatically logged in
            });
        }
    } catch (error) {
        console.error("Error in signup:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Invalid request" });
    }


    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw error;
        }

        if(data.session && data.session.access_token){
            res.json({ accessToken: data.session.access_token });
        } else {
            res.status(500).json({error: "Login failed: no access token"}); // or a more specific message
        }

    } catch (error) {
        console.error("Login error:", error);
        // Return appropriate status code based on error type
        if (error.message && error.message.includes('Invalid login credentials')) {
            return res.status(401).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.post("/api/auth/logout", authenticateUser, async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1]; // Assuming "Bearer TOKEN"

    try {
        const { error } = await supabaseClient.auth.signOut(token);

        if (error) {
            throw error;
        }

        res.send("User logged out successfully!");
    } catch (error) {
        console.error("Error in logout:", error);
        res.status(500).json({ error: error });
    }
});

// --------------------  Supabase Instance and Helper Functions --------------------
const supabase = supabaseClient

// Helper function to handle Supabase errors
const handleSupabaseError = (error) => {
    console.error('Supabase error:', error);
    return { error: 'Internal Server Error' };
};

// -------------------- Express Routes --------------------

// Test endpoint to verify backend is working
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Backend is working!', 
        timestamp: new Date().toISOString(),
        supabaseAvailable: !!supabase
    });
});

// 1. Get all furniture items
app.get('/api/furniture', async (req, res) => {
    try {
        console.log('Furniture endpoint called');
        console.log('supabaseClient available:', !!supabaseClient);
        console.log('supabase available:', !!supabase);
        
        if (!supabase) {
            console.error('Supabase client is not initialized!');
            return res.status(500).json({ error: 'Supabase client not initialized' });
        }

        console.log('Fetching furniture from Supabase...');
        const { data, error } = await supabase
            .from('marketplace_furniture')
            .select('*');

        console.log('Supabase response - Data:', data);
        console.log('Supabase response - Error:', error);

        if (error) {
            console.error("Supabase error details:", JSON.stringify(error, null, 2));
            
            // If table doesn't exist or permission issue, return mock data for development
            if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                console.log('Table not found, returning mock data for development');
                const mockData = [
                    {
                        id: 1,
                        name: "Modern Sofa",
                        description: "Comfortable 3-seater sofa in excellent condition",
                        image_url: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"],
                        price: 299,
                        created_at: new Date().toISOString(),
                        seller_email: "seller@example.com",
                        city_name: "Amsterdam",
                        sold: false,
                        isrehome: true
                    },
                    {
                        id: 2,
                        name: "Dining Table",
                        description: "Beautiful wooden dining table for 6 people",
                        image_url: ["https://images.unsplash.com/photo-1449247709967-d4461a6a6103?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"],
                        price: 150,
                        created_at: new Date().toISOString(),
                        seller_email: "user@example.com",
                        city_name: "Rotterdam",
                        sold: false,
                        isrehome: false
                    },
                    {
                        id: 3,
                        name: "Office Chair",
                        description: "Ergonomic office chair with lumbar support",
                        image_url: ["https://images.unsplash.com/photo-1541558869434-2840d308329a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"],
                        price: 75,
                        created_at: new Date().toISOString(),
                        seller_email: "office@example.com",
                        city_name: "Utrecht",
                        sold: false,
                        isrehome: true
                    }
                ];
                return res.json(mockData);
            }
            
            return res.status(500).json({ 
                error: 'Supabase error',
                details: error.message || error
            });
        }

        console.log('Sending successful response with data:', data);
        res.json(data || []);
    } catch (err) {
        console.error('Caught exception in furniture endpoint:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Get a specific furniture item by ID
app.get('/api/furniture/:id', async (req, res) => {
    try {
        const furnitureId = req.params.id;

        if (!furnitureId) {
            return res.status(400).json({ error: 'Furniture ID is required.' });
        }

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .select('*')
            .eq('id', furnitureId)
            .single();

        if (error) {
            console.error("Supabase error details:", JSON.stringify(error, null, 2));
            
            // If table doesn't exist or permission issue, return mock data for development
            if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                console.log('Table not found, returning mock data for development');
                const mockData = {
                    id: parseInt(furnitureId),
                    name: `Mock Item ${furnitureId}`,
                    description: "This is a mock furniture item for development",
                    image_url: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"],
                    price: 199,
                    created_at: new Date().toISOString(),
                    seller_email: "seller@example.com",
                    city_name: "Amsterdam",
                    sold: false,
                    isrehome: true
                };
                return res.json(mockData);
            }
            
            return res.status(500).json({ 
                error: 'Supabase error',
                details: error.message || error
            });
        }

        if (!data) {
            return res.status(404).json({ error: 'Furniture item not found.' });
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching furniture item:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// item moving request.
// 9. Item Moving Request Endpoint
app.post('/api/item-moving-requests', async (req, res) => {
    try {
      const {
        pickupType,
        furnitureItems,
        customItem,
        floorPickup,
        floorDropoff,
        contactInfo,
        estimatedPrice,
        selectedDate,
        isDateFlexible,
        basePrice,
        itemPoints,
        carryingCost,
        disassemblyCost,
        distanceCost,
        extraHelperCost
      } = req.body;
      
      console.log('the whole req.body', req.body);
      
      // Validate required fields
      if (!contactInfo || !contactInfo.email || !contactInfo.firstName || !contactInfo.lastName) {
        return res.status(400).json({ error: 'Contact information is required' });
      }

      const { data, error } = await supabase
        .from('item_moving')
        .insert([{
          email: contactInfo.email,
          pickuptype: pickupType || null,
          furnitureitems: furnitureItems || null,
          customitem: customItem || null,
          floorpickup: floorPickup ? parseInt(floorPickup, 10) : 0,
          floordropoff: floorDropoff ? parseInt(floorDropoff, 10) : 0,
          firstname: contactInfo.firstName,
          lastname: contactInfo.lastName,
          phone: contactInfo.phone || null,
          estimatedprice: estimatedPrice ? parseFloat(estimatedPrice) : 0,
          selecteddate: selectedDate || null,
          isdateflexible: Boolean(isDateFlexible),
          baseprice: basePrice ? parseFloat(basePrice) : null,
          itempoints: itemPoints ? parseInt(itemPoints, 10) : null,
          carryingcost: carryingCost ? parseFloat(carryingCost) : null,
          disassemblycost: disassemblyCost ? parseFloat(disassemblyCost) : null,
          distancecost: distanceCost ? parseFloat(distanceCost) : null,
          extrahelpercost: extraHelperCost ? parseFloat(extraHelperCost) : null,
        }])
        .select();

        console.log('data to sb', data);
  
      if (error) throw error;
      
      res.status(201).json(data[0]);
    } catch (error) {
      console.error('Error saving moving request:', error);
      res.status(500).json({ error: 'Failed to save moving request' });
    }
  });
  
// HOUSE Moving Request Endpoint
  app.post('/api/house-moving-requests', async (req, res) => {
    try {
    const {
        pickupType,
        furnitureItems,
        customItem,
        floorPickup,
        floorDropoff,
        contactInfo,
        estimatedPrice,
        selectedDate,
        isDateFlexible,
        basePrice,
        itemPoints,
        carryingCost,
        disassemblyCost,
        distanceCost,
        extraHelperCost
    } = req.body;
    
    console.log('the whole req.body', req.body);
    
    // Validate required fields
    if (!contactInfo || !contactInfo.email || !contactInfo.firstName || !contactInfo.lastName) {
      return res.status(400).json({ error: 'Contact information is required' });
    }

    const { data, error } = await supabase
        .from('house_moving')
        .insert([{
        email: contactInfo.email,
        pickuptype: pickupType || null,
        furnitureitems: furnitureItems || null,
        customitem: customItem || null,
        floorpickup: floorPickup ? parseInt(floorPickup, 10) : 0,
        floordropoff: floorDropoff ? parseInt(floorDropoff, 10) : 0,
        firstname: contactInfo.firstName,
        lastname: contactInfo.lastName,
        phone: contactInfo.phone || null,
        estimatedprice: estimatedPrice ? parseFloat(estimatedPrice) : 0,
        selecteddate: selectedDate || null,
        isdateflexible: Boolean(isDateFlexible),
        baseprice: basePrice ? parseFloat(basePrice) : null,
        itempoints: itemPoints ? parseInt(itemPoints, 10) : null,
        carryingcost: carryingCost ? parseFloat(carryingCost) : null,
        disassemblycost: disassemblyCost ? parseFloat(disassemblyCost) : null,
        distancecost: distanceCost ? parseFloat(distanceCost) : null,
        extrahelpercost: extraHelperCost ? parseFloat(extraHelperCost) : null,
        }])
        .select();

        console.log('data to sb', data);

    if (error) throw error;

    res.status(201).json(data[0]);
    } catch (error) {
    console.error('Error saving moving request:', error);
    res.status(500).json({ error: 'Failed to save moving request' });
    }
    });



  // Email sending endpoint
  app.post('/api/send-email', async (req, res) => {
      const { email, firstName, lastName } = req.body;
      console.log('here', email, firstName, lastName)
      
      if (!resend) {
          console.warn('Resend API key not configured - email not sent');
          return res.status(200).json({ success: true, message: 'Email service not configured' });
      }
      
      try {
          await resend.emails.send({
            // from: 'muhammadibnerafiq@gmail.com',
            from: 'Acme <onboarding@resend.dev>',

            to: email,
            subject: 'Your Moving Request Confirmation',
            html: 
            `
            <p>Dear ${firstName},</p>
            <p>Thank you for choosing ReHome BV for your moving needs. We're excited to assist you with your upcoming move!</p>
            <h2>What's Next?</h2>
                    <ol>
                        <li>We have received your request and are currently reviewing it.</li>
                        <li>Our team will carefully plan your move based on the details you provided.</li>
                        <li>We will send you a quote with the final price and a proposed date for your move.</li>
                    </ol>
                    <p>In the meantime, if you have any questions or need to provide additional information, please don't hesitate to contact us at <a href="mailto:info@rehomebv.com">info@rehomebv.com</a>.</p>
                    <p>Want to explore more about our services? Check out our marketplace:</p>
                    <a href="https://rehomebv.com/marketplace" class="button">Visit Our Marketplace</a>
                </div>
                <div class="footer">
                    <p>© 2025 ReHome BV. All rights reserved.</p>
                    <p>This email was sent to confirm your moving request. If you didn't request this, please ignore this email.</p>
                </div>
            `
          });
          console.log('IT WORKS!')
          return res.status(200).json({ success: true });
      } catch (error) {
          console.error("Error sending email:", error);
          return res.status(500).json({ error: error.message });
      }
  });

// 2. Add a new furniture item
app.post('/api/furniture', async (req, res) => {
    const { name, description, image_url, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required fields.' });
    }

    try {
        const { data, error } = await supabase
            .from('marketplace_furniture')
            .insert([{ name, description, image_url, price }])
            .select(); // Return the inserted data

        if (error) {
            return res.status(500).json(handleSupabaseError(error));
        }

        res.status(201).json(data[0]); // Return the newly created item
    } catch (err) {
        console.error('Error adding furniture:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Update a furniture item
app.put('/api/furniture/:id', async (req, res) => {
    const furnitureId = req.params.id;
    const { name, description, image_url, price, imageUrl, cityName, isRehome, category, subcategory, conditionRating, height, width, depth, pricingType, startingBid, latitude, longitude } = req.body;

    if (!furnitureId) {
        return res.status(400).json({ error: 'Furniture ID is required.' });
    }

    try {
        // Build update object with only provided fields
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (image_url !== undefined) updateData.image_urls = Array.isArray(image_url) ? image_url : [image_url];
        if (imageUrl !== undefined) updateData.image_urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl]; // Support both formats
        if (price !== undefined) updateData.price = price;
        if (cityName !== undefined) updateData.city_name = cityName;
        if (isRehome !== undefined) updateData.is_rehome = isRehome;
        if (category !== undefined) updateData.category = category;
        if (subcategory !== undefined) updateData.subcategory = subcategory;
        if (conditionRating !== undefined) updateData.condition_rating = conditionRating;
        if (height !== undefined) updateData.height_cm = height;
        if (width !== undefined) updateData.width_cm = width;
        if (depth !== undefined) updateData.depth_cm = depth;
        if (pricingType !== undefined) updateData.pricing_type = pricingType;
        if (startingBid !== undefined) updateData.starting_bid = startingBid;
        if (latitude !== undefined) updateData.latitude = latitude;
        if (longitude !== undefined) updateData.longitude = longitude;

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .update(updateData)
            .eq('id', furnitureId)
            .select();

        if (error) {
            return res.status(500).json(handleSupabaseError(error));
        }

        if (data && data.length > 0) {
            res.json(data[0]); // Return the updated item
        } else {
            res.status(404).json({ error: 'Furniture item not found.' });
        }
    } catch (err) {
        console.error('Error updating furniture:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 4. Delete a furniture item
app.delete('/api/furniture/:id', async (req, res) => {
    const furnitureId = req.params.id;

    if (!furnitureId) {
        return res.status(400).json({ error: 'Furniture ID is required.' });
    }

    try {
        const { error } = await supabase
            .from('marketplace_furniture')
            .delete()
            .eq('id', furnitureId);

        if (error) {
            return res.status(500).json(handleSupabaseError(error));
        }

        res.status(204).send(); // No content on successful delete
    } catch (err) {
        console.error('Error deleting furniture:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 5. Image Upload Endpoint
app.post('/api/upload', upload.array('photos', 10), async (req, res) => {
  try {
      if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'No files were uploaded.' });
      }

      const uploadedFiles = req.files;
      const imageUrls = [];
      console.log('uplod', uploadedFiles)
      // Check if the bucket exists and is public
      const { data: bucketData, error: bucketError } = await supabaseClient.storage.getBucket('furniture-images');
      console.log('Bucket data:', bucketData);
      
      if (bucketError) {
          console.error('Bucket error:', bucketError);
          return res.status(500).json({ error: 'Storage bucket not accessible', details: bucketError });
      }

      for (const file of uploadedFiles) {
          // Generate a unique filename
          const fileExtension = file.originalname.split('.').pop();
          const fileName = `${uuidv4()}.${fileExtension}`;

          console.log('uploaded smth', fileExtension)
          console.log('sdikf', fileName)

          const fileObject = new File([file.buffer], fileName, { type: file.mimetype });
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('furniture-images')
            .upload(fileName, fileObject);

          if (uploadError) {
              console.error('Error uploading file:', uploadError);
              return res.status(500).json({ error: 'Failed to upload image.', details: uploadError });
          }
          
          console.log('Upload successful:', uploadData);
          const imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/furniture-images/${fileName}`;
          console.log('Generated image URL:', imageUrl);
          imageUrls.push(imageUrl);
      }

      res.status(200).json({ imageUrls }); // Return an array of image URLs
  } catch (error) {
      console.error('Error during upload:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 6. New Furniture Listing Endpoint
app.post('/api/furniture/new', authenticateUser, async (req, res) => {
    console.log('=== NEW FURNITURE LISTING REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User from auth:', req.user?.email);

    const { 
        name, 
        description, 
        imageUrl,  // Frontend sends this
        price, 
        cityName, 
        isRehome, 
        category, 
        subcategory, 
        conditionRating, 
        height, 
        width, 
        depth, 
        pricingType, 
        startingBid, 
        latitude, 
        longitude 
    } = req.body;
    
    const sellerEmail = req.user.email; // Get seller's email from the authenticated user

    // Comprehensive validation
    const validationErrors = [];
    
    if (!name || name.trim().length === 0) {
        validationErrors.push('Furniture name is required');
    }
    
    if (!description || description.trim().length === 0) {
        validationErrors.push('Description is required');
    }
    
    if (!category || category.trim().length === 0) {
        validationErrors.push('Category is required');
    }
    
    if (!conditionRating || isNaN(parseInt(conditionRating))) {
        validationErrors.push('Condition rating is required');
    }
    
    if (!cityName || cityName.trim().length === 0) {
        validationErrors.push('Location is required');
    }
    
    // Pricing validation
    if (pricingType === 'fixed' && (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
        validationErrors.push('Valid price is required for fixed pricing');
    }
    
    if (pricingType === 'bidding' && (!startingBid || isNaN(parseFloat(startingBid)) || parseFloat(startingBid) <= 0)) {
        validationErrors.push('Valid starting bid is required for auction pricing');
    }
    
    // Image validation (allow empty array if no images)
    if (imageUrl && !Array.isArray(imageUrl)) {
        validationErrors.push('Image URL must be an array');
    }
    
    if (validationErrors.length > 0) {
        console.log('Validation errors:', validationErrors);
        return res.status(400).json({ error: validationErrors.join(', ') });
    }

    try {
        // Check if seller is admin - if so, automatically set isRehome to true
        const isAdminUser = ADMIN_EMAILS.includes(sellerEmail);
        const finalIsRehome = isAdminUser ? true : (isRehome || false);
        
        const insertData = {
            name, 
            description, 
            image_urls: Array.isArray(imageUrl) ? imageUrl : (imageUrl ? [imageUrl] : []), // Handle both array and single URL
            price: pricingType === 'fixed' ? parseFloat(price) : null, 
            seller_email: sellerEmail, 
            city_name: cityName, 
            sold: false,
            is_rehome: finalIsRehome,
            category: category || null,
            subcategory: subcategory || null,
            condition_rating: conditionRating ? parseInt(conditionRating) : null,
            height_cm: height && !isNaN(parseFloat(height)) ? parseFloat(height) : null,
            width_cm: width && !isNaN(parseFloat(width)) ? parseFloat(width) : null,
            depth_cm: depth && !isNaN(parseFloat(depth)) ? parseFloat(depth) : null,
            pricing_type: pricingType || 'fixed',
            starting_bid: pricingType === 'bidding' && startingBid ? parseFloat(startingBid) : null,
            latitude: latitude && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null,
            longitude: longitude && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null
        };

        console.log('Data to insert:', JSON.stringify(insertData, null, 2));

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .insert([insertData])
            .select();
            
        console.log('Supabase insert response - Data:', data);
        console.log('Supabase insert response - Error:', error);
        
        if (error) {
            console.error('Supabase error creating furniture:', error);
            return res.status(500).json({ 
                error: 'Failed to create listing', 
                details: error.message,
                code: error.code
            });
        }

        res.status(201).json(data[0]); // Return the newly created item
    } catch (err) {
        console.error('Error creating furniture:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ 
            error: 'Internal Server Error IN THE creation',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// 7. Special Request Endpoint
app.post('/api/special-request', async (req, res) => {
  const { selectedServices, message, contactInfo } = req.body;

  try {
    const { data, error } = await supabase
      .from('services')
      .insert([{ selected_services: selectedServices, message, contact_info: contactInfo }])
      .select();

    if (error) {
      console.error('Error creating special request:', error);
      return res.status(500).json({ error: 'Failed to save special request.' });
    }

    res.status(201).json({ message: 'Special request saved successfully.' });
  } catch (err) {
    console.error('Error in special request endpoint:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 8. Mark Furniture as Sold and Move to Sold Items
app.post('/api/furniture/sold/:id', authenticateUser, async (req, res) => {
    const furnitureId = req.params.id;

    if (!furnitureId) {
        return res.status(400).json({ error: 'Furniture ID is required.' });
    }
    try {
        // 1. Fetch the furniture item to get all its data
        const { data: furnitureData, error: fetchError } = await supabase
            .from('marketplace_furniture')
            .select('*')
            .eq('id', furnitureId)
            .single();

        if (fetchError) {
            console.error('Error fetching furniture item:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch furniture item.' });
        }

        if (!furnitureData) {
            return res.status(404).json({ error: 'Furniture item not found.' });
        }

        // 2. Insert into sold_furniture table
        const { error: insertError } = await supabase
            .from('sold_furniture')
            .insert([furnitureData]);

        if (insertError) {
            console.error('Error inserting into sold_furniture:', insertError);
            return res.status(500).json({ error: 'Failed to move furniture item to sold.' });
        }
        // 3. Delete from marketplace_furniture table
        const { error: deleteError } = await supabase
            .from('marketplace_furniture')
            .delete()
            .eq('id', furnitureId);

        if (deleteError) {
            console.error('Error deleting from marketplace_furniture:', deleteError);
            return res.status(500).json({ error: 'Failed to remove furniture item from active listings.' });
        }

        res.status(200).json({ message: 'Furniture marked as sold and moved to sold items.' });

    } catch (err) {
        console.error('Error marking furniture as sold:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Marketplace Messages Routes --------------------

// Get messages by item ID
app.get('/api/messages/item/:itemId', async (req, res) => {
    const itemId = req.params.itemId;
    
    try {
        const { data, error } = await supabase
            .from('marketplace_messages')
            .select('*')
            .eq('item_id', itemId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return res.status(500).json({ error: 'Failed to fetch conversation messages' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get messages for a specific user (conversations they're part of)
app.get('/api/messages/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const { data, error } = await supabase
            .from('marketplace_messages')
            .select('*')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching user messages:', error);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error fetching user messages:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Send a new message
app.post('/api/messages', async (req, res) => {
    const message = req.body;
    
    try {
        const { data, error } = await supabase
            .from('marketplace_messages')
            .insert([message])
            .select();

        if (error) {
            console.error('Error sending message:', error);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        res.status(201).json(data ? data[0] : null);
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Mark messages as read
app.put('/api/messages/read', async (req, res) => {
    const { itemId, userId } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('marketplace_messages')
            .update({ read: true })
            .eq('item_id', itemId)
            .eq('receiver_id', userId)
            .eq('read', false);

        if (error) {
            console.error('Error marking messages as read:', error);
            return res.status(500).json({ error: 'Failed to mark messages as read' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error marking messages as read:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Chat & Message Routes --------------------

// Get all chats for a user
app.get('/api/chats', async (req, res) => {
    const userId = req.user.id; // Assuming you have auth middleware setting req.user
    
    try {
        const { data, error } = await supabase
            .rpc('get_user_chats_with_latest_message', { user_uuid: userId });

        if (error) {
            console.error('Error fetching chats:', error);
            return res.status(500).json({ error: 'Failed to fetch chats' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error fetching chats:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get messages for a specific chat
app.get('/api/chats/:chatId/messages', async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a new chat
app.post('/api/chats', async (req, res) => {
    const { title } = req.body;
    const userId = req.user.id;
    
    try {
        // Generate a unique chat_id
        const chatId = `chat_${uuidv4()}`;
        
        const { data, error } = await supabase
            .from('chats')
            .insert([{
                chat_id: chatId,
                user_id: userId,
                title: title
            }])
            .select();

        if (error) {
            console.error('Error creating chat:', error);
            return res.status(500).json({ error: 'Failed to create chat' });
        }

        res.status(201).json(data ? data[0] : null);
    } catch (err) {
        console.error('Error creating chat:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Send a new message
app.post('/api/chats/:chatId/messages', async (req, res) => {
    const { chatId } = req.params;
    const { content, sender = 'user' } = req.body;
    const userId = req.user.id;
    
    try {
        const { data, error } = await supabase
            .from('messages')
            .insert([{
                chat_id: chatId,
                user_id: userId,
                content: content,
                sender: sender
            }])
            .select();

        if (error) {
            console.error('Error sending message:', error);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        res.status(201).json(data ? data[0] : null);
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// -------------------- Project Routes --------------------

// Get all projects for a user
app.get('/api/projects', async (req, res) => {
    const userId = req.user.id;
    
    try {
        const { data, error } = await supabase
            .from('projects_with_chat_view')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching projects:', error);
            return res.status(500).json({ error: 'Failed to fetch projects' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Error fetching projects:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a new project
app.post('/api/projects', async (req, res) => {
    const { chatId, title, description } = req.body;
    const userId = req.user.id;
    
    try {
        const { data, error } = await supabase
            .from('projects')
            .insert([{
                user_id: userId,
                chat_id: chatId,
                title: title,
                description: description
            }])
            .select();

        if (error) {
            console.error('Error creating project:', error);
            return res.status(500).json({ error: 'Failed to create project' });
        }

        res.status(201).json(data ? data[0] : null);
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update project status
app.put('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    
    try {
        const { data, error } = await supabase
            .from('projects')
            .update({ status })
            .eq('id', projectId)
            .eq('user_id', userId)
            .select();

        if (error) {
            console.error('Error updating project:', error);
            return res.status(500).json({ error: 'Failed to update project' });
        }

        res.json(data ? data[0] : null);
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==================== LEGAL ENDPOINTS ====================

// Terms of Service endpoint
app.get('/api/legal/terms-of-service', (req, res) => {
    // Redirect to your terms of service document
    res.redirect('https://rehomebv.com/terms');
});

// Privacy Policy endpoint  
app.get('/api/legal/privacy-policy', (req, res) => {
    // Redirect to your privacy policy document
    res.redirect('https://rehomebv.com/privacy');
});

// Accept Terms endpoint
app.post('/api/legal/accept-terms', authenticateUser, async (req, res) => {
    const { userId, acceptedAt, termsVersion, privacyVersion } = req.body;
    const userEmail = req.user.email;

    try {
        // Log the terms acceptance (you can create a table for this if needed)
        console.log(`User ${userEmail} (${userId}) accepted terms version ${termsVersion} at ${acceptedAt}`);
        
        // For now, just return success. You can implement database logging if needed
        res.status(200).json({ 
            success: true, 
            message: 'Terms acceptance recorded successfully',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error recording terms acceptance:', err);
        res.status(500).json({ error: 'Failed to record terms acceptance' });
    }
});

// ==================== FURNITURE ITEMS ENDPOINTS ====================

// Get all furniture items
app.get("/api/furniture-items", async (req, res) => {
    try {
        const { page = 1, limit = 50, category, search } = req.query;
        const offset = (page - 1) * limit;

        let query = supabaseClient
            .from('furniture_items')
            .select('*', { count: 'exact' });

        if (category) {
            query = query.eq('category', category);
        }

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({
            success: true,
            data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error("Get furniture items error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Create furniture item
app.post("/api/furniture-items", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { error: validationError } = furnitureItemSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        const { data, error } = await supabaseClient
            .from('furniture_items')
            .insert(req.body)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.status(201).json({ success: true, data });
    } catch (error) {
        console.error("Create furniture item error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Update furniture item
app.put("/api/furniture-items/:id", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { error: validationError } = furnitureItemSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        // Get old values for audit
        const { data: oldData } = await supabaseClient
            .from('furniture_items')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        req.oldValues = oldData;

        const { data, error } = await supabaseClient
            .from('furniture_items')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Update furniture item error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Delete furniture item
app.delete("/api/furniture-items/:id", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { error } = await supabaseClient
            .from('furniture_items')
            .delete()
            .eq('id', req.params.id);

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, message: "Furniture item deleted successfully" });
    } catch (error) {
        console.error("Delete furniture item error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// ==================== CITY BASE CHARGES ENDPOINTS ====================

// Get all city base charges
app.get("/api/city-base-charges", async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .from('city_base_charges')
            .select('*')
            .order('city_name');

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Get city base charges error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Create city base charge
app.post("/api/city-base-charges", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { error: validationError } = cityBaseChargeSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        const { cityName, normal, cityDay, dayOfWeek } = req.body;
        const insertData = { city_name: cityName, normal, city_day: cityDay, day_of_week: dayOfWeek };

        const { data, error } = await supabaseClient
            .from('city_base_charges')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.status(201).json({ success: true, data });
    } catch (error) {
        console.error("Create city base charge error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Update city base charge
app.put("/api/city-base-charges/:cityName", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { normal, cityDay, dayOfWeek } = req.body;
        const updateData = {};
        
        if (normal !== undefined) updateData.normal = normal;
        if (cityDay !== undefined) updateData.city_day = cityDay;
        if (dayOfWeek !== undefined) updateData.day_of_week = dayOfWeek;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: "No valid fields to update" });
        }

        // Get old values for audit
        const { data: oldData } = await supabaseClient
            .from('city_base_charges')
            .select('*')
            .eq('city_name', req.params.cityName)
            .single();
        
        req.oldValues = oldData;

        const { data, error } = await supabaseClient
            .from('city_base_charges')
            .update(updateData)
            .eq('city_name', req.params.cityName)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Update city base charge error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// ==================== CITY DAY DATA ENDPOINTS ====================

// Get all city day data
app.get("/api/city-day-data", async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .from('city_day_data')
            .select('*')
            .order('city_name');

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Get city day data error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Create city day data
app.post("/api/city-day-data", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { error: validationError } = cityDayDataSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        const { cityName, days } = req.body;
        const insertData = { city_name: cityName, days };

        const { data, error } = await supabaseClient
            .from('city_day_data')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.status(201).json({ success: true, data });
    } catch (error) {
        console.error("Create city day data error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Update city day data
app.put("/api/city-day-data/:cityName", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { days } = req.body;
        
        if (!Array.isArray(days)) {
            return res.status(400).json({ success: false, error: "Days must be an array" });
        }

        // Get old values for audit
        const { data: oldData } = await supabaseClient
            .from('city_day_data')
            .select('*')
            .eq('city_name', req.params.cityName)
            .single();
        
        req.oldValues = oldData;

        const { data, error } = await supabaseClient
            .from('city_day_data')
            .update({ days })
            .eq('city_name', req.params.cityName)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Update city day data error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// ==================== PRICING CONFIGURATION ENDPOINTS ====================

// Get pricing configuration
app.get("/api/pricing-config", async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .from('pricing_config')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Get pricing config error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Update pricing configuration
app.put("/api/pricing-config", authenticateAdmin, auditLog, async (req, res) => {
    try {
        const { config } = req.body;
        
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, error: "Config object is required" });
        }

        // Get old values for audit
        const { data: oldData } = await supabaseClient
            .from('pricing_config')
            .select('*')
            .eq('is_active', true)
            .single();
        
        req.oldValues = oldData;

        // Update existing active config
        const { data, error } = await supabaseClient
            .from('pricing_config')
            .update({ config: { ...oldData?.config, ...config } })
            .eq('is_active', true)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Update pricing config error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// ==================== PRICING CALCULATION ENDPOINT ====================

// Calculate pricing
app.post("/api/calculate-pricing", async (req, res) => {
    try {
        const { error: validationError } = pricingCalculationSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        const {
            serviceType,
            pickupLocation,
            dropoffLocation,
            selectedDate,
            isDateFlexible,
            itemQuantities,
            floorPickup,
            floorDropoff,
            elevatorPickup,
            elevatorDropoff,
            assemblyItems,
            extraHelperItems,
            isStudent,
            hasStudentId,
            isEarlyBooking = false
        } = req.body;

        // Get pricing configuration
        const { data: pricingConfig, error: configError } = await supabaseClient
            .from('pricing_config')
            .select('*')
            .eq('is_active', true)
            .single();

        if (configError || !pricingConfig) {
            return res.status(500).json({ success: false, error: "Pricing configuration not found" });
        }

        const config = pricingConfig.config;

        // Get city base charges
        const { data: cityCharges, error: cityError } = await supabaseClient
            .from('city_base_charges')
            .select('*')
            .eq('city_name', pickupLocation);

        if (cityError || !cityCharges || cityCharges.length === 0) {
            return res.status(400).json({ success: false, error: "City not supported" });
        }

        const cityCharge = cityCharges[0];

        // Get city day data
        const { data: cityDayData, error: dayError } = await supabaseClient
            .from('city_day_data')
            .select('*')
            .eq('city_name', pickupLocation);

        // Get furniture items and calculate base cost
        const { data: furnitureItems, error: furnitureError } = await supabaseClient
            .from('furniture_items')
            .select('*');

        if (furnitureError) {
            return res.status(500).json({ success: false, error: "Error fetching furniture data" });
        }

        // Calculate pricing breakdown
        const breakdown = calculatePricingBreakdown({
            serviceType,
            pickupLocation,
            dropoffLocation,
            selectedDate,
            isDateFlexible,
            itemQuantities,
            floorPickup,
            floorDropoff,
            elevatorPickup,
            elevatorDropoff,
            assemblyItems,
            extraHelperItems,
            isStudent,
            hasStudentId,
            isEarlyBooking,
            config,
            cityCharge,
            cityDayData: cityDayData?.[0] || null,
            furnitureItems
        });

        res.json({ success: true, data: breakdown });
    } catch (error) {
        console.error("Calculate pricing error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Helper function for pricing calculation
function calculatePricingBreakdown(params) {
    const {
        serviceType,
        selectedDate,
        itemQuantities,
        floorPickup,
        floorDropoff,
        elevatorPickup,
        elevatorDropoff,
        assemblyItems,
        extraHelperItems,
        isStudent,
        hasStudentId,
        isEarlyBooking,
        config,
        cityCharge,
        cityDayData,
        furnitureItems
    } = params;

    const furnitureMap = furnitureItems.reduce((acc, item) => {
        acc[item.name] = item;
        return acc;
    }, {});

    // Calculate base cost from furniture points
    let totalPoints = 0;
    const itemDetails = [];

    Object.entries(itemQuantities).forEach(([itemName, quantity]) => {
        if (quantity > 0 && furnitureMap[itemName]) {
            const item = furnitureMap[itemName];
            const points = item.points * quantity;
            totalPoints += points;
            itemDetails.push({
                name: itemName,
                quantity,
                pointsPerItem: item.points,
                totalPoints: points
            });
        }
    });

    // Determine if it's a city day
    const date = new Date(selectedDate);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const isCityDay = cityDayData?.days?.includes(dayName) || false;

    // Base charge
    const baseCharge = isCityDay ? cityCharge.city_day : cityCharge.normal;

    // Calculate point-based cost
    const pointBasedCost = totalPoints * config.baseMultiplier * (baseCharge / 10); // Normalize base charge

    // Weekend multiplier
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const weekendMultiplier = isWeekend ? config.weekendMultiplier : 1;

    // City day multiplier
    const cityDayMultiplier = isCityDay ? config.cityDayMultiplier : 1;

    // Floor charges
    const floorCharges = (floorPickup + floorDropoff) * config.floorChargePerLevel;

    // Elevator discount
    const elevatorDiscount = (elevatorPickup || elevatorDropoff) ? 
        (pointBasedCost * (1 - config.elevatorDiscount)) : 0;

    // Assembly charges
    const assemblyCharges = Object.values(assemblyItems).filter(Boolean).length * config.assemblyChargePerItem;

    // Extra helper charges
    const extraHelperCharges = Object.values(extraHelperItems).filter(Boolean).length * config.extraHelperChargePerItem;

    // Calculate subtotal
    let subtotal = pointBasedCost * weekendMultiplier * cityDayMultiplier + 
                   floorCharges + assemblyCharges + extraHelperCharges - elevatorDiscount;

    // Student discount
    const studentDiscountAmount = (isStudent && hasStudentId) ? 
        subtotal * config.studentDiscount : 0;

    // Early booking discount
    const earlyBookingDiscountAmount = isEarlyBooking ? 
        subtotal * config.earlyBookingDiscount : 0;

    // Apply discounts
    subtotal -= studentDiscountAmount + earlyBookingDiscountAmount;

    // Ensure minimum charge
    const total = Math.max(subtotal, config.minimumCharge);

    return {
        itemDetails,
        breakdown: {
            baseCharge,
            pointBasedCost: parseFloat(pointBasedCost.toFixed(2)),
            weekendMultiplier,
            cityDayMultiplier,
            floorCharges: parseFloat(floorCharges.toFixed(2)),
            elevatorDiscount: parseFloat(elevatorDiscount.toFixed(2)),
            assemblyCharges: parseFloat(assemblyCharges.toFixed(2)),
            extraHelperCharges: parseFloat(extraHelperCharges.toFixed(2)),
            studentDiscountAmount: parseFloat(studentDiscountAmount.toFixed(2)),
            earlyBookingDiscountAmount: parseFloat(earlyBookingDiscountAmount.toFixed(2)),
            subtotal: parseFloat(subtotal.toFixed(2)),
            total: parseFloat(total.toFixed(2))
        },
        metadata: {
            totalPoints,
            isCityDay,
            isWeekend,
            selectedDate,
            cityName: cityCharge.city_name
        }
    };
}

// ==================== AUDIT LOGS ENDPOINTS ====================

// Get audit logs
app.get("/api/audit-logs", authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, adminId, tableName, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;

        let query = supabaseClient
            .from('audit_logs')
            .select(`
                *,
                admin_users(email, role)
            `, { count: 'exact' });

        if (adminId) query = query.eq('admin_id', adminId);
        if (tableName) query = query.eq('table_name', tableName);
        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(500).json({ success: false, ...handleSupabaseError(error) });
        }

        res.json({
            success: true,
            data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error("Get audit logs error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// --------------------  Bidding System Routes --------------------

// Get all bids for a specific item
app.get('/api/bids/:itemId', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .order('bid_amount', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching bids:', error);
        res.status(500).json({ error: 'Failed to fetch bids' });
    }
});

// Get highest bid for an item
app.get('/api/bids/:itemId/highest', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .eq('status', 'approved')
            .eq('is_highest_bid', true)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || null);
    } catch (error) {
        console.error('Error fetching highest bid:', error);
        res.status(500).json({ error: 'Failed to fetch highest bid' });
    }
});

// Get user's bid for a specific item
app.get('/api/bids/:itemId/user/:userEmail', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        const { userEmail } = req.params;
        
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .eq('bidder_email', userEmail)
            .in('status', ['pending', 'approved'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || null);
    } catch (error) {
        console.error('Error fetching user bid:', error);
        res.status(500).json({ error: 'Failed to fetch user bid' });
    }
});

// Place a new bid
app.post('/api/bids', async (req, res) => {
    try {
        const { item_id, bidder_email, bidder_name, bid_amount, status } = req.body;

        if (!item_id || !bidder_email || !bidder_name || !bid_amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Convert item_id to string to match UUID format in database
        const itemIdStr = String(item_id);

        // Check if user already has a bid for this item
        const { data: existingBids, error: checkError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .eq('bidder_email', bidder_email)
            .in('status', ['pending', 'approved']);

        if (checkError) throw checkError;

        // Check if there's already a higher bid
        const { data: highestBid, error: highestBidError } = await supabase
            .from('marketplace_bids')
            .select('bid_amount')
            .eq('item_id', itemIdStr)
            .eq('status', 'approved')
            .order('bid_amount', { ascending: false })
            .limit(1)
            .single();

        if (highestBidError && highestBidError.code !== 'PGRST116') {
            throw highestBidError;
        }

        if (highestBid && bid_amount <= highestBid.bid_amount) {
            return res.status(400).json({ 
                error: `Your bid must be higher than the current highest bid of €${highestBid.bid_amount}` 
            });
        }

        // If user has an existing bid, update it instead of creating new one
        if (existingBids && existingBids.length > 0) {
            const { data, error } = await supabase
                .from('marketplace_bids')
                .update({
                    bid_amount: bid_amount,
                    status: 'pending',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingBids[0].id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data, message: 'Bid updated successfully' });
        } else {
            // Create new bid
            const { data, error } = await supabase
                .from('marketplace_bids')
                .insert([{
                    item_id: itemIdStr,
                    bidder_email,
                    bidder_name,
                    bid_amount,
                    status: status || 'pending',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data, message: 'Bid placed successfully' });
        }
    } catch (error) {
        console.error('Error placing bid:', error);
        res.status(500).json({ error: 'Failed to place bid' });
    }
});

// Check if user can add item to cart
app.get('/api/bids/:itemId/cart-eligibility/:userEmail', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        const { userEmail } = req.params;
        
        // Get user's bid for this item
        const { data: userBid, error: userBidError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .eq('bidder_email', userEmail)
            .in('status', ['pending', 'approved'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (userBidError && userBidError.code !== 'PGRST116') throw userBidError;
        
        if (!userBid) {
            return res.json({ canAdd: false, message: 'You need to place a bid first before adding to cart' });
        }

        if (userBid.status === 'pending') {
            return res.json({ canAdd: false, message: 'Your bid is pending approval. Please wait for admin confirmation.' });
        }

        if (userBid.status === 'rejected') {
            return res.json({ canAdd: false, message: 'Your bid was rejected. Please place a new bid.' });
        }

        if (userBid.status === 'outbid') {
            return res.json({ canAdd: false, message: 'You have been outbid. Please place a higher bid to proceed.' });
        }

        if (userBid.status === 'approved' && userBid.is_highest_bid) {
            return res.json({ canAdd: true, message: 'You can proceed to checkout!' });
        }

        res.json({ canAdd: false, message: 'You do not have the highest bid for this item.' });
    } catch (error) {
        console.error('Error checking cart eligibility:', error);
        res.status(500).json({ error: 'Error checking bid status. Please try again.' });
    }
});

// Get all bids by user
app.get('/api/bids/user/:userEmail', async (req, res) => {
    try {
        const { userEmail } = req.params;
        
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select(`
                *,
                marketplace_furniture (
                    name,
                    image_url,
                    price,
                    seller_email
                )
            `)
            .eq('bidder_email', userEmail)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching user bids:', error);
        res.status(500).json({ error: 'Failed to fetch user bids' });
    }
});

// Admin: Get all bids
app.get('/api/admin/bids', authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select(`
                *,
                marketplace_furniture (
                    name,
                    image_url,
                    price,
                    seller_email
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching all bids:', error);
        res.status(500).json({ error: 'Failed to fetch bids' });
    }
});

// Admin: Approve a bid
app.put('/api/admin/bids/:bidId/approve', authenticateUser, async (req, res) => {
    try {
        const { bidId } = req.params;
        const { admin_notes } = req.body;
        const adminEmail = req.user.email;

        const { data, error } = await supabase
            .from('marketplace_bids')
            .update({
                status: 'approved',
                approved_by: adminEmail,
                approved_at: new Date().toISOString(),
                admin_notes: admin_notes || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', bidId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: 'Bid approved successfully' });
    } catch (error) {
        console.error('Error approving bid:', error);
        res.status(500).json({ error: 'Failed to approve bid' });
    }
});

// Admin: Reject a bid
app.put('/api/admin/bids/:bidId/reject', authenticateUser, async (req, res) => {
    try {
        const { bidId } = req.params;
        const { admin_notes } = req.body;
        const adminEmail = req.user.email;

        const { data, error } = await supabase
            .from('marketplace_bids')
            .update({
                status: 'rejected',
                approved_by: adminEmail,
                approved_at: new Date().toISOString(),
                admin_notes: admin_notes || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', bidId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data, message: 'Bid rejected successfully' });
    } catch (error) {
        console.error('Error rejecting bid:', error);
        res.status(500).json({ error: 'Failed to reject bid' });
    }
});

// Debug endpoint for testing authentication
app.post('/api/furniture/debug', authenticateUser, async (req, res) => {
    console.log('=== DEBUG FURNITURE ENDPOINT ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User from auth:', req.user?.email);
    console.log('Headers:', req.headers);
    
    res.status(200).json({
        success: true,
        message: 'Authentication working',
        user: req.user?.email,
        bodyReceived: req.body,
        timestamp: new Date().toISOString()
    });
});

export default app;

// Start the server only when running this file directly (for local development)
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}