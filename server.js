// server.js - ReHome Pricing System Backend
import dotenv from 'dotenv';
dotenv.config();
import Joi from "joi";
import { supabaseClient, SUPABASE_URL } from "./db/params.js";
import express, { json } from "express";

// Create alias for backward compatibility (since code uses both supabase and supabaseClient)
const supabase = supabaseClient;
import cors from "cors";
import multer from 'multer'; // Import multer for handling file uploads
import { v4 as uuidv4 } from 'uuid'; // Import uuid to generate unique file names
import { Resend } from 'resend';
import { createMollieClient } from '@mollie/api-client';
import { sendReHomeOrderEmail } from "./notif.js";
import http from 'http'; // Import http module for server creation
import { authenticateUser } from './middleware/auth.js';
import * as imageProcessingService from './services/imageProcessingService.js';
import axios from 'axios';
import jwt from 'jsonwebtoken';
const app = express();

// Set generous timeout settings for image processing
app.use((req, res, next) => {
    // Set timeout to 5 minutes for all requests
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    next();
});

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
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size to allow very large files before compression
        files: 10 // max 10 files
    }
});

// List of admin email addresses - keep in sync with other admin files
const ADMIN_EMAILS = [
  'muhammadibnerafiq123@gmail.com',
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

        // First, try to verify as custom JWT token
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
        
        try {
            const decoded = jwt.verify(token, jwtSecret);
            console.log('✅ Custom JWT token verified for admin check:', decoded.email);
            
            // Check if user is admin
            if (!isAdmin(decoded.email)) {
                return res.status(403).json({ success: false, error: "Admin access required" });
            }

            // Get user from database using the decoded info
            const { data: dbUser, error: dbError } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', decoded.userId)
                .single();

            if (dbError || !dbUser) {
                console.log('❌ User not found in database:', decoded.userId);
                return res.status(403).json({ success: false, error: "User not found" });
            }

            req.user = {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name,
                provider: decoded.provider || 'custom'
            };
            
            console.log('✅ Custom admin authentication successful for:', req.user.email);
            return next();
            
        } catch (jwtError) {
            console.log('🔄 Custom JWT verification failed, trying Supabase:', jwtError.message);
            
            // Fall back to Supabase token verification
            const { data: user, error } = await supabaseClient.auth.getUser(token);

            if (error || !user || !user.user) {
                return res.status(403).json({ success: false, error: "Invalid token or user not found" });
            }

            if (!isAdmin(user.user.email)) {
                return res.status(403).json({ success: false, error: "Admin access required" });
            }

            req.user = user.user;
            console.log('✅ Supabase admin authentication successful for:', req.user.email);
            return next();
        }

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

// Pricing calculation validation schema
const pricingCalculationSchema = Joi.object({
    serviceType: Joi.string().required(),
    pickupLocation: Joi.string().required(),
    dropoffLocation: Joi.string().required(),
    selectedDate: Joi.date().required(),
    isDateFlexible: Joi.boolean().default(false),
    itemQuantities: Joi.object().pattern(Joi.string(), Joi.number()).required(),
    floorPickup: Joi.number().default(0),
    floorDropoff: Joi.number().default(0),
    elevatorPickup: Joi.boolean().default(false),
    elevatorDropoff: Joi.boolean().default(false),
    assemblyItems: Joi.object().pattern(Joi.string(), Joi.boolean()),
    extraHelperItems: Joi.object().pattern(Joi.string(), Joi.boolean()),
    isStudent: Joi.boolean().default(false),
    hasStudentId: Joi.boolean().default(false),
    isEarlyBooking: Joi.boolean().default(false)
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
import adminMarketplaceRoutes from './api/admin/marketplace.js';
import adminCityPricesRoutes from './api/admin/city-prices.js';
import adminPricingConfigsRoutes from './api/admin/pricing-configs.js';
import adminPricingMultipliersRoutes from './api/admin/pricing-multipliers.js';
import rehomeOrdersRoutes from './api/rehome-orders.js';

// --------------------  Application Routes --------------------

app.get("/api", (req, res) => {
    res.send("ReHome B.V. running successfully... 🚀");
});

// Use routes
app.use('/api/chats', chatRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin/marketplace', adminMarketplaceRoutes);
app.use('/api/admin/city-prices', adminCityPricesRoutes);
app.use('/api/admin/pricing-configs', adminPricingConfigsRoutes);
app.use('/api/admin/pricing-multipliers', adminPricingMultipliersRoutes);
app.use('/api/rehome-orders', rehomeOrdersRoutes);

// Admin furniture-items endpoint (alias for marketplace furniture)
app.get('/api/admin/furniture-items', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, category, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('furniture')
      .select(`
        *,
        furniture_ratings(rating, comment)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,seller_email.ilike.%${search}%`);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (status && status !== 'all') {
      if (status === 'available') {
        query = query.eq('sold', false);
      } else if (status === 'sold') {
        query = query.eq('sold', true);
      }
    }

    const { data: furniture, error, count } = await query;

    if (error) {
      console.error('Error fetching furniture items:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch furniture items'
      });
    }

    // Map is_rehome to isrehome for consistency
    const mappedFurniture = furniture.map(item => ({
      ...item,
      isrehome: item.is_rehome ?? false
    }));

    res.json({
      success: true,
      data: mappedFurniture,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || furniture.length,
        hasMore: furniture.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error in admin furniture-items endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

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

// Custom Google OAuth callback endpoint
app.post("/api/auth/google/callback", async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;
        
        console.log('🔑 Google OAuth callback received');
        console.log('Code:', code ? code.substring(0, 10) + '...' : 'Missing');
        console.log('Redirect URI:', redirect_uri);

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }

        // const clientId = process.env.GOOGLE_CLIENT_ID;
        // const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const clientId = '721138794330-ng7j4un0gt4k516h5fv0absqqd3rvtbs.apps.googleusercontent.com'
        const clientSecret = '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'

        console.log('🔍 Environment check:', {
            clientIdExists: !!clientId,
            clientSecretExists: !!clientSecret,
            clientIdLength: clientId ? clientId.length : 0,
            clientSecretLength: clientSecret ? clientSecret.length : 0
        });

        if (!clientId || !clientSecret) {
            console.error('❌ Google OAuth credentials not configured');
            console.error('Missing:', {
                clientId: !clientId ? 'GOOGLE_CLIENT_ID missing' : 'OK',
                clientSecret: !clientSecret ? 'GOOGLE_CLIENT_SECRET missing' : 'OK'
            });
            return res.status(500).json({ 
                error: 'Google OAuth not configured',
                details: 'Missing Google OAuth credentials in environment variables'
            });
        }

        // Exchange authorization code for access token
        console.log('🔄 Exchanging code for tokens...');
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code: code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirect_uri,
            grant_type: 'authorization_code'
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const { access_token, id_token, refresh_token } = tokenResponse.data;
        if (!access_token) {
            throw new Error('No access token received from Google');
        }

        console.log('✅ Tokens received from Google', access_token);

        // Get user info from Google
        console.log('🔄 Fetching user info from Google...');
        const userInfoResponse = await axios.get(
            `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`,
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    Accept: 'application/json'
                }
            }
        );

        const googleUser = userInfoResponse.data;
        console.log('👤 Google user info:', { 
            email: googleUser.email, 
            name: googleUser.name,
            id: googleUser.id 
        });

        // Check if user exists in Supabase
        console.log('🔄 Checking/creating user in database...');
        console.log('📋 User data from Google:', {
            email: googleUser.email,
            name: googleUser.name,
            id: googleUser.id,
            picture: googleUser.picture
        });
        
        let dbUser;
        
        // Test database connection first
        console.log('🔍 Testing database connection...');
        const { data: testData, error: testError } = await supabaseClient
            .from('profiles')
            .select('count')
            .limit(1);
        
        if (testError) {
            console.error('❌ Database connection failed:', testError);
            return res.status(500).json({ 
                error: 'Database connection failed',
                details: testError.message
            });
        }
        console.log('✅ Database connection working');
        
        // First, try to find existing user by email
        console.log('🔍 Searching for existing user...');
        const { data: existingUsers, error: fetchError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('email', googleUser.email)
            .limit(1);

        if (fetchError) {
            console.error('❌ Error fetching user:', fetchError);
            console.error('❌ Fetch error details:', {
                message: fetchError.message,
                details: fetchError.details,
                hint: fetchError.hint,
                code: fetchError.code
            });
            return res.status(500).json({ 
                error: 'Failed to fetch user data',
                details: fetchError.message
            });
        }

        console.log('🔍 Existing users found:', existingUsers?.length || 0);

        if (existingUsers && existingUsers.length > 0) {
            dbUser = existingUsers[0];
            console.log('✅ Found existing user:', dbUser.email);
            
            // Update user info if needed
            console.log('🔄 Updating existing user...');
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({
                    name: googleUser.name,
                    avatar_url: googleUser.picture,
                    google_id: googleUser.id,
                    last_sign_in: new Date().toISOString()
                })
                .eq('id', dbUser.id);

            if (updateError) {
                console.error('❌ Error updating user:', updateError);
                console.error('❌ Update error details:', {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                    code: updateError.code
                });
            } else {
                console.log('✅ User updated successfully');
            }
        } else {
            // Create new user
            console.log('🔄 Creating new user...');
            const newUserData = {
                email: googleUser.email,
                name: googleUser.name,
                avatar_url: googleUser.picture,
                google_id: googleUser.id,
                auth_provider: 'google',
                created_at: new Date().toISOString(),
                last_sign_in: new Date().toISOString()
            };
            
            console.log('📋 New user data to insert:', newUserData);
            
            const { data: newUsers, error: insertError } = await supabaseClient
                .from('profiles')
                .insert([newUserData])
                .select();

            if (insertError) {
                console.error('❌ Error creating user:', insertError);
                console.error('❌ Insert error details:', {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code
                });
                return res.status(500).json({ 
                    error: 'Failed to create user account',
                    details: insertError.message,
                    code: insertError.code,
                    hint: insertError.hint
                });
            }

            if (!newUsers || newUsers.length === 0) {
                console.error('❌ No user data returned after insert');
                return res.status(500).json({ 
                    error: 'Failed to create user account',
                    details: 'No user data returned after insert'
                });
            }

            dbUser = newUsers[0];
            console.log('✅ Created new user:', dbUser.email);
        }

        console.log('✅ User account ready');

        // Create custom JWT token with the correct structure
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
        const customToken = jwt.sign({
            userId: dbUser.id,  // Use userId not sub
            email: dbUser.email,
            sub: dbUser.id,  // Include sub for frontend compatibility
            email_verified: true,
            phone_verified: true,
            role: 'user',
            provider: 'google'
        }, jwtSecret, { expiresIn: '48h' });

        console.log('✅ Custom JWT token created for user:', dbUser.email);

        // Return user data and custom JWT token
        res.json({
            accessToken: customToken,  // Use custom JWT token
            id_token: id_token,
            user: {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name,
                avatar_url: dbUser.avatar_url,
                provider: 'google'
            },
            google_access_token: access_token,
            google_refresh_token: refresh_token
        });

    } catch (error) {
        console.error('❌ Google OAuth callback error:', error);
        
        let errorMessage = 'Authentication failed';
        if (error.response?.data?.error_description) {
            errorMessage = error.response.data.error_description;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(400).json({ 
            error: errorMessage,
            details: error.response?.data || error.message
        });
    }
});

// Google OAuth authentication
app.post("/api/auth/google", async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
        return res.status(400).json({ error: "Access token is required" });
    }

    try {
        console.log('Processing Google OAuth token...');
        
        // Get user data from Supabase using the access token
        const { data: userData, error: userError } = await supabaseClient.auth.getUser(access_token);

        if (userError) {
            console.error('Error getting user from token:', userError);
            return res.status(401).json({ error: "Invalid access token" });
        }

        if (!userData.user) {
            return res.status(401).json({ error: "No user found" });
        }

        const { user } = userData;
        console.log('Google OAuth user:', user.email);

        // Return user data and access token
        res.status(200).json({
            message: "Google authentication successful",
            user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email,
                avatar_url: user.user_metadata?.avatar_url,
                provider: 'google'
            },
            accessToken: access_token
        });

    } catch (error) {
        console.error("Error in Google auth:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
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
        supabaseAvailable: !!supabaseClient
    });
});

// 1. Get all furniture items
app.get('/api/furniture', async (req, res) => {
    try {
        console.log('Furniture endpoint called');
        console.log('supabaseClient available:', !!supabaseClient);
        
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        console.log('📋 Pagination params:', { page, limit, offset });
        
        if (!supabaseClient) {
            console.error('Supabase client is not initialized!');
            return res.status(500).json({ error: 'Supabase client not initialized' });
        }

        console.log('Fetching furniture from Supabase...');
        
        // Get total count first
        const { count, error: countError } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .eq('sold', false); // Only non-sold items

        if (countError) {
            console.log('Error getting count:', countError);
        }

        // Check if we should include sold items
        const includeSold = req.query.include_sold === 'true';
        console.log('Include sold items:', includeSold);

        // Build query - conditionally filter by sold status
        let query = supabaseClient
            .from('marketplace_furniture')
            .select('*');

        // Only filter out sold items if not explicitly including them
        if (!includeSold) {
            query = query.eq('sold', false);
        }

        // Apply ordering and pagination
        const { data, error } = await query
            .order('created_at', { ascending: false }) // Newest first
            .range(offset, offset + limit - 1); // Pagination

        console.log('Supabase response - Data count:', data?.length);
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
                        isrehome: true,
                        pricing_type: 'fixed'
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
                        isrehome: false,
                        pricing_type: 'fixed'
                    },
                    {
                        id: 3,
                        name: "Free Chair",
                        description: "Free office chair - pickup only",
                        image_url: ["https://images.unsplash.com/photo-1541558869434-2840d308329a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"],
                        price: 0,
                        created_at: new Date().toISOString(),
                        seller_email: "office@example.com",
                        city_name: "Utrecht",
                        sold: false,
                        isrehome: false,
                        pricing_type: 'free'
                    }
                ];
                
                return res.json({
                    data: mockData.slice(offset, offset + limit),
                    pagination: {
                        currentPage: page,
                        totalPages: Math.ceil(mockData.length / limit),
                        totalItems: mockData.length,
                        itemsPerPage: limit,
                        hasNextPage: page < Math.ceil(mockData.length / limit),
                        hasPreviousPage: page > 1
                    }
                });
            }
            
            return res.status(500).json({ 
                error: 'Supabase error',
                details: error.message || error
            });
        }

        // Map database field names to frontend expected field names
        const mappedData = (data || []).map(item => ({
            ...item,
            isrehome: item.is_rehome, // Map is_rehome to isrehome for frontend
            image_url: item.image_urls // Also ensure consistency for image field
        }));

        const totalItems = count || 0;
        const totalPages = Math.ceil(totalItems / limit);

        const response = {
            data: mappedData,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        };

        console.log('✅ Sending paginated response:', {
            itemCount: mappedData.length,
            pagination: response.pagination
        });
        
        res.json(response);
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

        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome, // Map is_rehome to isrehome for frontend
            image_url: data.image_urls // Also ensure consistency for image field
        };

        res.json(mappedData);
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

// ReHome order confirmation email endpoint
app.post('/api/rehome-order/send-confirmation', async (req, res) => {
  try {
    const { 
      orderNumber, 
      items, 
      totalAmount, 
      customerInfo 
    } = req.body;
    
    // Validate required fields
    if (!orderNumber || !items || !customerInfo || !customerInfo.email) {
      return res.status(400).json({ 
        error: 'Missing required fields: orderNumber, items, customerInfo.email' 
      });
    }
    
    console.log('📧 Sending ReHome order confirmation email for order:', orderNumber);
    
    const emailResult = await sendReHomeOrderEmail({
      orderNumber,
      customerEmail: customerInfo.email,
      customerFirstName: customerInfo.firstName || 'Valued Customer',
      customerLastName: customerInfo.lastName || '',
      items,
      totalAmount
    });
    
    if (!emailResult.success) {
      console.warn('⚠️ Email sending failed but continuing with order process:', emailResult.message || emailResult.error);
      // We don't want to fail the entire order just because email failed
      return res.status(200).json({ 
        success: true, 
        emailSent: false,
        message: 'Order processed but confirmation email could not be sent'
      });
    }
    
    return res.status(200).json({ 
      success: true,
      emailSent: true,
      message: 'Order confirmation email sent successfully'
    });
    
  } catch (error) {
    console.error('❌ Error sending ReHome order confirmation email:', error);
    res.status(500).json({ 
      error: 'Failed to send order confirmation email',
      details: error.message
    });
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

        // Handle pricing based on type
        if (pricingType === 'free') {
            updateData.price = 0;
        } else if (pricingType === 'fixed' && price !== undefined) {
            updateData.price = price;
        } else if (pricingType === 'negotiable' || pricingType === 'bidding') {
            updateData.price = null;
        }

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

// 5. Image Upload Endpoint with Automatic Format Conversion
app.post('/api/upload', (req, res, next) => {
    // Handle multer errors
    upload.array('photos', 10)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err.code, err.message);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'File too large. Maximum file size is 50MB per file. Our system will automatically compress your images to under 2MB.' 
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ error: 'Too many files. Maximum 10 files allowed.' });
            }
            return res.status(400).json({ error: 'File upload error: ' + err.message });
        }
        if (err) {
            return res.status(500).json({ error: 'Upload failed: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
  try {
      console.log(`📤 Upload request received - Files: ${req.files?.length || 0}`);
      
      // Log detailed file information
      if (req.files && req.files.length > 0) {
          req.files.forEach((file, index) => {
              console.log(`📁 File ${index + 1}: ${file.originalname}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB, Type: ${file.mimetype}`);
          });
      }
      
      if (!req.files || req.files.length === 0) {
          console.error('❌ No files received in request');
          return res.status(400).json({ error: 'No files were uploaded.' });
      }

      const uploadedFiles = req.files;
      const imageUrls = [];
      const conversionResults = [];
      
      console.log(`Processing ${uploadedFiles.length} uploaded files`);
      
      // Check if the bucket exists and is public
      const { data: bucketData, error: bucketError } = await supabaseClient.storage.getBucket('furniture-images');
      console.log('Bucket data:', bucketData);
      
      if (bucketError) {
          console.error('Bucket error:', bucketError);
          return res.status(500).json({ error: 'Storage bucket not accessible', details: bucketError });
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i];
          console.log(`\n📸 Processing file ${i + 1}/${uploadedFiles.length}: ${file.originalname}`);
          console.log(`📊 Original file size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB`);
          
          try {
              // Check if the image format is supported
              const isSupported = imageProcessingService.isImageFormatSupported(file.originalname);
              console.log(`Format supported: ${isSupported} (${file.originalname})`);
              
              let finalBuffer = file.buffer;
              let finalFilename = file.originalname;
              let finalMimeType = file.mimetype;
              
              // Always process images for optimization and format conversion
              console.log(`🔄 Processing image: ${file.originalname} (Original size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)`);
              
              let conversionResult;
              
              // Convert unsupported formats (HEIC, etc.) or optimize all images
              if (!isSupported || file.originalname.toLowerCase().includes('.heic')) {
                  console.log(`🔄 Converting unsupported format: ${file.originalname}`);
                  
                  conversionResult = await imageProcessingService.convertImageToWebFormat(
                      file.buffer,
                      file.originalname,
                      {
                          quality: 85,
                          maxWidth: 1920,
                          maxHeight: 1080,
                          removeMetadata: true
                      }
                  );
              } else {
                  // Optimize supported formats (JPEG, PNG, etc.) for better performance
                  console.log(`🔧 Optimizing supported image: ${file.originalname}`);
                  
                  const optimizedBuffer = await imageProcessingService.processImageWithSharp(
                      file.buffer,
                      {
                          format: file.originalname.toLowerCase().includes('.png') ? 'png' : 'jpeg',
                          quality: 85,
                          maxWidth: 1920,
                          maxHeight: 1080,
                          removeMetadata: true
                      }
                  );
                  
                  const extension = imageProcessingService.getFileExtension(file.originalname);
                  const outputExtension = extension === 'jpg' ? 'jpg' : (extension === 'png' ? 'png' : 'jpg');
                  
                  conversionResult = {
                      buffer: optimizedBuffer,
                      filename: `${uuidv4()}.${outputExtension}`,
                      mimeType: `image/${outputExtension === 'jpg' ? 'jpeg' : outputExtension}`,
                      originalFormat: extension,
                      outputFormat: outputExtension === 'jpg' ? 'jpeg' : outputExtension
                  };
              }
              
              // Set processed file details
              finalBuffer = conversionResult.buffer;
              finalFilename = conversionResult.filename;
              finalMimeType = conversionResult.mimeType;
              
              // Additional compression if file is still over 2MB
              const targetSizeInBytes = 2 * 1024 * 1024; // 2MB
              if (finalBuffer.length > targetSizeInBytes) {
                  console.log(`🔄 File still over 2MB (${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB), applying aggressive compression...`);
                  
                  let currentBuffer = finalBuffer;
                  let quality = 70;
                  let maxWidth = 1600;
                  let maxHeight = 1200;
                  let attempts = 0;
                  const maxAttempts = 5;
                  
                  while (currentBuffer.length > targetSizeInBytes && attempts < maxAttempts) {
                      attempts++;
                      console.log(`🔄 Compression attempt ${attempts}/${maxAttempts} - Quality: ${quality}, Max dimensions: ${maxWidth}x${maxHeight}`);
                      
                      try {
                          const compressedBuffer = await imageProcessingService.processImageWithSharp(
                              currentBuffer,
                              {
                                  format: 'jpeg', // Force JPEG for better compression
                                  quality: quality,
                                  maxWidth: maxWidth,
                                  maxHeight: maxHeight,
                                  removeMetadata: true
                              }
                          );
                          
                          currentBuffer = compressedBuffer;
                          console.log(`📊 After compression attempt ${attempts}: ${(currentBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                          
                          // Reduce quality and dimensions for next attempt
                          quality = Math.max(30, quality - 10);
                          maxWidth = Math.max(800, maxWidth - 200);
                          maxHeight = Math.max(600, maxHeight - 150);
                          
                      } catch (compressionError) {
                          console.error(`❌ Compression attempt ${attempts} failed:`, compressionError.message);
                          break;
                      }
                  }
                  
                  // Update final values
                  finalBuffer = currentBuffer;
                  finalMimeType = 'image/jpeg';
                  finalFilename = finalFilename.replace(/\.(png|webp|gif)$/i, '.jpg');
                  
                  if (finalBuffer.length > targetSizeInBytes) {
                      console.log(`⚠️  Warning: File still over 2MB after ${maxAttempts} attempts. Final size: ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                  } else {
                      console.log(`✅ Successfully compressed to ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                  }
              }
              
              // Calculate size reduction
              const sizeReduction = Math.round((1 - finalBuffer.length / file.buffer.length) * 100);
              console.log(`📊 Size reduction: ${sizeReduction}% (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB → ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
              
              // Track all conversions and optimizations
              conversionResults.push({
                  original: file.originalname,
                  converted: finalFilename,
                  originalFormat: conversionResult.originalFormat,
                  outputFormat: conversionResult.outputFormat,
                  originalSize: file.buffer.length,
                  convertedSize: finalBuffer.length,
                  sizeReduction: sizeReduction
              });
              
              console.log(`✅ Processing completed: ${file.originalname} -> ${finalFilename}`);

              // Upload the processed image
              console.log(`📤 Uploading: ${finalFilename} (${finalBuffer.length} bytes)`);
              
              const fileObject = new File([finalBuffer], finalFilename, { type: finalMimeType });
              const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('furniture-images')
                .upload(finalFilename, fileObject);

              if (uploadError) {
                  console.error('Error uploading processed file:', uploadError);
                  return res.status(500).json({ 
                      error: 'Failed to upload processed image.', 
                      details: uploadError,
                      file: finalFilename
                  });
              }
              
              console.log('Upload successful:', uploadData);
              const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/furniture-images/${finalFilename}`;
              console.log('Generated image URL:', imageUrl);
              imageUrls.push(imageUrl);
              
          } catch (fileError) {
              console.error(`Error processing file ${file.originalname}:`, fileError);
              return res.status(500).json({ 
                  error: `Failed to process image: ${file.originalname}`, 
                  details: fileError.message 
              });
          }
      }

      console.log(`\n🎉 All ${uploadedFiles.length} files processed successfully!`);
      
      // Calculate average size reduction
      const avgSizeReduction = conversionResults.length > 0 
          ? Math.round(conversionResults.reduce((sum, result) => sum + result.sizeReduction, 0) / conversionResults.length)
          : 0;
      
      // Return response with conversion details
      const response = { 
          imageUrls,
          totalFiles: uploadedFiles.length,
          successCount: imageUrls.length,
          averageSizeReduction: avgSizeReduction,
          totalOriginalSize: conversionResults.reduce((sum, result) => sum + result.originalSize, 0),
          totalOptimizedSize: conversionResults.reduce((sum, result) => sum + result.convertedSize, 0),
          conversions: conversionResults
      };
      
      console.log('📊 Upload Summary:', {
          filesProcessed: uploadedFiles.length,
          averageSizeReduction: `${avgSizeReduction}%`,
          totalSavings: `${((response.totalOriginalSize - response.totalOptimizedSize) / 1024 / 1024).toFixed(2)} MB`
      });
      
      res.status(200).json(response);
      
  } catch (error) {
      console.error('Error during upload process:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
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
    
    // Free pricing type doesn't require price validation
    
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
        
        console.log('=== FURNITURE CREATION DEBUG ===');
        console.log('📋 Seller email:', sellerEmail);
        console.log('📋 Pricing type:', pricingType);
        console.log('📋 Price:', price);
        console.log('📋 Starting bid:', startingBid);
        console.log('📋 Is admin:', isAdminUser);
        console.log('📋 Final isRehome:', finalIsRehome);
        
        const insertData = {
            name, 
            description, 
            image_urls: Array.isArray(imageUrl) ? imageUrl : (imageUrl ? [imageUrl] : []), // Handle both array and single URL
            price: pricingType === 'fixed' ? parseFloat(price) : 
                   pricingType === 'free' ? 0 : null, 
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

        console.log('📋 Final insert data:', JSON.stringify(insertData, null, 2));

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .insert([insertData])
            .select();
            
        console.log('Supabase insert response - Data:', data);
        console.log('Supabase insert response - Error:', error);
        
        if (error) {
            // Handle pricing constraint violation for free items
            if (error.code === '23514' && error.message.includes('check_fixed_price') && pricingType === 'free') {
                console.log('⚠️ Pricing constraint violation for free item, trying fallback approach');
                
                // Try to create with negotiable pricing instead as a fallback
                const fallbackData = {
                    ...insertData,
                    pricing_type: 'negotiable',
                    price: null, // Set to null for negotiable
                    starting_bid: null
                };
                
                console.log('🔄 Attempting fallback with negotiable pricing:', JSON.stringify(fallbackData, null, 2));
                
                const { data: fallbackResult, error: fallbackError } = await supabase
                    .from('marketplace_furniture')
                    .insert([fallbackData])
                    .select();
                
                if (fallbackError) {
                    console.error('❌ Fallback also failed:', fallbackError);
                    return res.status(500).json({ 
                        error: 'Failed to create listing', 
                        details: `Original: ${error.message}. Fallback: ${fallbackError.message}`,
                        code: error.code,
                        note: 'Please run the database migration to support free pricing'
                    });
                }
                
                console.log('✅ Free item created using negotiable pricing fallback');
                return res.status(201).json({
                    ...fallbackResult[0],
                    _fallback_used: true,
                    _original_pricing_type: 'free',
                    _note: 'Created as negotiable due to missing database migration. Please run migration to enable free pricing.'
                });
            }
            
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

// Helper function to update highest bid status for an item
const updateHighestBidStatus = async (itemId) => {
    try {
        const itemIdStr = String(itemId);
        
        // First, reset all bids for this item to not be highest
        await supabase
            .from('marketplace_bids')
            .update({ is_highest_bid: false })
            .eq('item_id', itemIdStr);

        // Find the highest approved bid
        const { data: highestBid, error: highestError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .eq('status', 'approved')
            .order('bid_amount', { ascending: false })
            .limit(1)
            .single();

        if (highestError && highestError.code !== 'PGRST116') {
            throw highestError;
        }

        // If there's a highest bid, mark it as highest
        if (highestBid) {
            await supabase
                .from('marketplace_bids')
                .update({ is_highest_bid: true })
                .eq('id', highestBid.id);
            
            // Mark all other approved bids as outbid
            await supabase
                .from('marketplace_bids')
                .update({ status: 'outbid' })
                .eq('item_id', itemIdStr)
                .eq('status', 'approved')
                .neq('id', highestBid.id);
        }

        console.log(`Updated highest bid status for item ${itemIdStr}`);
    } catch (error) {
        console.error('Error updating highest bid status:', error);
        throw error;
    }
};

// Get all bids for a specific item - Simple list like chat messages
app.get('/api/bids/:itemId', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        
        console.log('📋 Fetching all bids for item:', itemIdStr);
        
        const { data, error } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .order('created_at', { ascending: false }); // Order by time like chat messages

        if (error) {
            console.log('❌ Error fetching bids:', error);
            throw error;
        }
        
        console.log('📋 Found bids:', data?.length || 0);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Error fetching bids:', error);
        res.status(500).json({ error: 'Failed to fetch bids' });
    }
});

// Get highest bid for an item - Simple, no status checks
app.get('/api/bids/:itemId/highest', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        
        console.log('📋 Fetching highest bid for item:', itemIdStr);
        
        // Get the highest bid - no status filtering, all bids are valid
        const { data: highestBid, error } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .order('bid_amount', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.log('❌ Error fetching highest bid:', error);
            throw error;
        }

        console.log('📋 Highest bid found:', highestBid);
        res.json(highestBid || null);
    } catch (error) {
        console.error('❌ Error fetching highest bid:', error);
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

// Place a new bid - Simple like chat messages
app.post('/api/bids', async (req, res) => {
    try {
        console.log('=== PLACING BID (BACKEND) ===');
        console.log('Request body:', req.body);
        
        const { item_id, bidder_email, bidder_name, bid_amount } = req.body;

        if (!item_id || !bidder_email || !bidder_name || !bid_amount) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: item_id, bidder_email, bidder_name, bid_amount' 
            });
        }

        // Convert item_id to string to match UUID format in database
        const itemIdStr = String(item_id);

        // Check if item exists and is set for bidding
        const { data: item, error: itemError } = await supabase
            .from('marketplace_furniture')
            .select('pricing_type, sold, isrehome')
            .eq('id', itemIdStr)
            .single();

        if (itemError) {
            console.log('❌ Error fetching item:', itemError);
            return res.status(404).json({
                success: false,
                error: 'Item not found'
            });
        }

        // Check if item is sold
        if (item.sold) {
            return res.status(400).json({
                success: false,
                error: 'This item has already been sold'
            });
        }

        // Check if item is a ReHome item
        if (item.isrehome) {
            return res.status(400).json({
                success: false,
                error: 'Bidding is not allowed on ReHome items'
            });
        }

        // Check if item is set for bidding
        if (item.pricing_type !== 'bidding') {
            return res.status(400).json({
                success: false,
                error: 'This item is not available for bidding'
            });
        }

        console.log('📋 Placing bid for item:', itemIdStr);
        console.log('📋 Bidder:', bidder_email);
        console.log('📋 Amount:', bid_amount);

        // Check if there's already a higher bid
        const { data: highestBid, error: highestBidError } = await supabase
            .from('marketplace_bids')
            .select('bid_amount')
            .eq('item_id', itemIdStr)
            .order('bid_amount', { ascending: false })
            .limit(1)
            .single();

        if (highestBidError && highestBidError.code !== 'PGRST116') {
            console.log('❌ Error checking highest bid:', highestBidError);
            throw highestBidError;
        }

        if (highestBid && bid_amount <= highestBid.bid_amount) {
            console.log('❌ Bid too low:', bid_amount, 'vs current highest:', highestBid.bid_amount);
            return res.status(400).json({ 
                success: false,
                error: `Your bid must be higher than the current highest bid of €${highestBid.bid_amount}` 
            });
        }

        // Simply create new bid - no complex status logic
        const { data, error } = await supabase
            .from('marketplace_bids')
            .insert([{
                item_id: itemIdStr,
                bidder_email,
                bidder_name,
                bid_amount: parseFloat(bid_amount),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.log('❌ Supabase insert error:', error);
            throw error;
        }

        console.log('✅ Bid placed successfully:', data);
        res.json({ success: true, data, message: 'Bid placed successfully!' });

    } catch (error) {
        console.error('❌ Error placing bid:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to place bid', 
            details: error.message 
        });
    }
});

// Check if user can add item to cart - Simple check based on highest bid
app.get('/api/bids/:itemId/cart-eligibility/:userEmail', async (req, res) => {
    try {
        const itemIdStr = String(req.params.itemId);
        const { userEmail } = req.params;
        
        console.log('📋 Checking cart eligibility for user:', userEmail, 'item:', itemIdStr);
        
        // First check if the item is a ReHome item
        const { data: item, error: itemError } = await supabase
            .from('marketplace_furniture')
            .select('isrehome')
            .eq('id', itemIdStr)
            .single();
            
        if (itemError) throw itemError;
        
        // If it's a ReHome item, no bidding is allowed
        if (item.isrehome) {
            return res.json({ canAdd: false, message: 'Bidding is not allowed on ReHome items' });
        }
        
        // Get the highest bid for this item
        const { data: highestBid, error: highestBidError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('item_id', itemIdStr)
            .order('bid_amount', { ascending: false })
            .limit(1)
            .single();

        if (highestBidError && highestBidError.code !== 'PGRST116') throw highestBidError;
        
        if (!highestBid) {
            return res.json({ canAdd: false, message: 'No bids placed yet. Place a bid first!' });
        }

        // Check if this user has the highest bid
        if (highestBid.bidder_email === userEmail) {
            return res.json({ canAdd: true, message: 'You have the highest bid! You can proceed to checkout.' });
        }

        // User doesn't have the highest bid
        res.json({ 
            canAdd: false, 
            message: `You need to place a higher bid than €${highestBid.bid_amount} to proceed.` 
        });
    } catch (error) {
        console.error('❌ Error checking cart eligibility:', error);
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

        // First, get the bid that's being approved
        const { data: bidToApprove, error: fetchError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('id', bidId)
            .single();

        if (fetchError) throw fetchError;

        // Approve the bid
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

        // Update highest bid status for this item
        await updateHighestBidStatus(bidToApprove.item_id);

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

        // First, get the bid that's being rejected
        const { data: bidToReject, error: fetchError } = await supabase
            .from('marketplace_bids')
            .select('*')
            .eq('id', bidId)
            .single();

        if (fetchError) throw fetchError;

        const { data, error } = await supabase
            .from('marketplace_bids')
            .update({
                status: 'rejected',
                approved_by: adminEmail,
                approved_at: new Date().toISOString(),
                admin_notes: admin_notes || null,
                is_highest_bid: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', bidId)
            .select()
            .single();

        if (error) throw error;

        // Update highest bid status for this item
        await updateHighestBidStatus(bidToReject.item_id);

        res.json({ success: true, data, message: 'Bid rejected successfully' });
    } catch (error) {
        console.error('Error rejecting bid:', error);
        res.status(500).json({ error: 'Failed to reject bid' });
    }
});

// Admin: Refresh highest bid status for all items
app.post('/api/admin/bids/refresh-highest', authenticateUser, async (req, res) => {
    try {
        // Get all unique item IDs that have bids
        const { data: items, error: itemsError } = await supabase
            .from('marketplace_bids')
            .select('item_id')
            .not('item_id', 'is', null);

        if (itemsError) throw itemsError;

        // Get unique item IDs
        const uniqueItemIds = [...new Set(items.map(item => item.item_id))];

        // Update highest bid status for each item
        const updatePromises = uniqueItemIds.map(itemId => updateHighestBidStatus(itemId));
        await Promise.all(updatePromises);

        res.json({ 
            success: true, 
            message: `Updated highest bid status for ${uniqueItemIds.length} items`,
            itemsUpdated: uniqueItemIds.length
        });
    } catch (error) {
        console.error('Error refreshing highest bid status:', error);
        res.status(500).json({ error: 'Failed to refresh highest bid status' });
    }
});

// Admin: Get all marketplace furniture
app.get('/api/admin/marketplace-furniture', authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('marketplace_furniture')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Map database field names to frontend expected field names
        const mappedData = (data || []).map(item => ({
            ...item,
            isrehome: item.is_rehome, // Map is_rehome to isrehome for frontend
            image_url: item.image_urls // Also ensure consistency for image field
        }));
        
        res.json(mappedData);
    } catch (error) {
        console.error('Error fetching marketplace furniture:', error);
        res.status(500).json({ error: 'Failed to fetch marketplace furniture' });
    }
});

// Admin: Delete marketplace furniture item
app.delete('/api/admin/marketplace-furniture/:itemId', authenticateUser, async (req, res) => {
    try {
        const { itemId } = req.params;
        const adminEmail = req.user.email;

        // Check if user is admin
        if (!isAdmin(adminEmail)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { error } = await supabase
            .from('marketplace_furniture')
            .delete()
            .eq('id', itemId);

        if (error) throw error;
        res.json({ success: true, message: 'Furniture item deleted successfully' });
    } catch (error) {
        console.error('Error deleting marketplace furniture:', error);
        res.status(500).json({ error: 'Failed to delete furniture item' });
    }
});

// Admin: Update marketplace furniture item
app.put('/api/admin/marketplace-furniture/:itemId', authenticateUser, async (req, res) => {
    try {
        const { itemId } = req.params;
        const updates = req.body;
        const adminEmail = req.user.email;

        // Check if user is admin
        if (!isAdmin(adminEmail)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', itemId)
            .select()
            .single();

        if (error) throw error;
        
        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome, // Map is_rehome to isrehome for frontend
            image_url: data.image_urls // Also ensure consistency for image field
        };
        
        res.json({ success: true, data: mappedData, message: 'Furniture item updated successfully' });
    } catch (error) {
        console.error('Error updating marketplace furniture:', error);
        res.status(500).json({ error: 'Failed to update furniture item' });
    }
});

// Update item status (available/reserved/sold) - for both users and admins
app.put('/api/furniture/:itemId/status', authenticateUser, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { status } = req.body;
        const userEmail = req.user.email;

        console.log('=== STATUS UPDATE DEBUG ===');
        console.log('Item ID:', itemId);
        console.log('New status:', status);
        console.log('User email:', userEmail);
        console.log('Request body:', req.body);

        if (!['available', 'reserved', 'sold'].includes(status)) {
            console.log('❌ Invalid status provided:', status);
            return res.status(400).json({ error: 'Invalid status. Must be available, reserved, or sold' });
        }

        // Check if user owns the item or is admin
        console.log('🔍 Fetching item to check ownership...');
        const { data: item, error: fetchError } = await supabase
            .from('marketplace_furniture')
            .select('seller_email, sold, name')
            .eq('id', itemId)
            .single();

        if (fetchError) {
            console.log('❌ Error fetching item:', fetchError);
            throw fetchError;
        }

        if (!item) {
            console.log('❌ Item not found');
            return res.status(404).json({ error: 'Item not found' });
        }

        console.log('📋 Item details:', { 
            name: item.name, 
            currentSold: item.sold, 
            sellerEmail: item.seller_email 
        });

        if (item.seller_email !== userEmail && !isAdmin(userEmail)) {
            console.log('❌ Access denied - not owner or admin');
            return res.status(403).json({ error: 'You can only update your own listings' });
        }

        console.log('✅ Access granted, updating status...');
        
        // Check if status column exists, fallback to sold field if it doesn't
        const updateData = {
            sold: status === 'sold', // Always update sold field for backward compatibility
            updated_at: new Date().toISOString()
        };

        // Try to update with status column first
        try {
            updateData.status = status;
            console.log('🔄 Attempting to update with status column...');
        } catch (e) {
            console.log('⚠️ Status column may not exist, using sold field only');
        }

        const { data, error } = await supabase
            .from('marketplace_furniture')
            .update(updateData)
            .eq('id', itemId)
            .select()
            .single();

        if (error) {
            // If status column doesn't exist, try without it
            if (error.code === '42703' && error.message.includes('status')) {
                console.log('⚠️ Status column does not exist, updating sold field only');
                
                const fallbackData = {
                    sold: status === 'sold',
                    updated_at: new Date().toISOString()
                };
                
                const { data: fallbackResult, error: fallbackError } = await supabase
                    .from('marketplace_furniture')
                    .update(fallbackData)
                    .eq('id', itemId)
                    .select()
                    .single();

                if (fallbackError) {
                    console.log('❌ Error updating with fallback:', fallbackError);
                    throw fallbackError;
                }

                console.log('✅ Status updated using sold field fallback');
                
                // Add status to response for frontend compatibility
                const fallbackMappedData = {
                    ...fallbackResult,
                    status: fallbackResult.sold ? 'sold' : 'available', // Map sold to status
                    isrehome: fallbackResult.is_rehome,
                    image_url: fallbackResult.image_urls
                };

                return res.json({ 
                    success: true, 
                    data: fallbackMappedData, 
                    message: `Item status updated to ${status}`,
                    note: 'Updated using sold field - please run database migration for full status support'
                });
            } else {
                console.log('❌ Error updating status:', error);
                throw error;
            }
        }

        console.log('✅ Status updated successfully:', data);

        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome,
            image_url: data.image_urls
        };

        res.json({ success: true, data: mappedData, message: `Item status updated to ${status}` });
    } catch (error) {
        console.error('❌ Error updating item status:', error);
        res.status(500).json({ 
            error: 'Failed to update item status', 
            details: error.message,
            code: error.code 
        });
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

// Database migration for status field (run once)
const migrateStatusField = async () => {
    try {
        console.log('🔄 Checking if status column exists...');
        
        // Simple check - try to select status column
        const { data, error } = await supabaseClient
            .from('marketplace_furniture')
            .select('status')
            .limit(1);

        if (error && error.code === '42703') {
            console.log('❌ Status column does not exist!');
            console.log('📋 MANUAL MIGRATION REQUIRED:');
            console.log('📋 Please run the SQL in backend/db/add_status_column.sql in your Supabase dashboard');
            console.log('📋 This will add the status column and update the pricing constraint');
        } else if (!error) {
            console.log('✅ Status column exists');
        } else {
            console.log('⚠️ Error checking status column:', error.message);
        }
    } catch (error) {
        console.log('❌ Migration check failed:', error.message);
    }
};

// Database migration for free pricing type support
const migratePricingConstraint = async () => {
    console.log('📋 Pricing constraint migration is included in the manual SQL script');
    console.log('📋 Run backend/db/add_status_column.sql in Supabase to update constraints');
};

// Run migration on startup
if (supabaseClient) {
    migrateStatusField();
    migratePricingConstraint();
}

// Get sold furniture items for seller dashboard
app.get('/api/furniture/sold', authenticateUser, async (req, res) => {
    try {
        console.log('=== SOLD FURNITURE ENDPOINT ===');
        console.log('User email:', req.user?.email);
        
        if (!supabase) {
            console.error('Supabase client is not initialized!');
            return res.status(500).json({ error: 'Supabase client not initialized' });
        }

        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        console.log('📋 Pagination params:', { page, limit, offset });

        // For admin users, get all sold items. For regular users, get only their sold items
        let query = supabase
            .from('marketplace_furniture')
            .select('*')
            .eq('sold', true) // Only sold items
            .order('updated_at', { ascending: false }); // Most recently updated first

        // If not admin, filter by seller email
        if (!isAdmin(req.user?.email)) {
            query = query.eq('seller_email', req.user?.email);
        }

        // Apply pagination
        const { data, error } = await query.range(offset, offset + limit - 1);

        console.log('Sold items response - Data count:', data?.length);
        console.log('Sold items response - Error:', error);

        if (error) {
            console.error("Supabase error details:", JSON.stringify(error, null, 2));
            return res.status(500).json({ 
                error: 'Supabase error',
                details: error.message || error
            });
        }

        // Map database field names to frontend expected field names
        const mappedData = (data || []).map(item => ({
            ...item,
            isrehome: item.is_rehome,
            image_url: item.image_urls
        }));

        console.log('✅ Sending sold items response:', {
            itemCount: mappedData.length,
            userEmail: req.user?.email,
            isAdmin: isAdmin(req.user?.email)
        });
        
        res.json({
            data: mappedData,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(mappedData.length / limit),
                totalItems: mappedData.length,
                itemsPerPage: limit,
                hasNextPage: false, // Simple implementation for now
                hasPreviousPage: page > 1
            }
        });
    } catch (err) {
        console.error('Caught exception in sold furniture endpoint:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: err.message
        });
    }
});

export default app;

// Start the server only when running this file directly (for local development)
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    
    // Create HTTP server with generous timeout settings
    const server = http.createServer(app);
    
    // Set server timeouts to handle long image processing operations
    server.keepAliveTimeout = 300000; // 5 minutes
    server.headersTimeout = 310000; // Slightly longer than keepAliveTimeout
    server.requestTimeout = 300000; // 5 minutes
    
    server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Server timeouts configured: keepAlive=5min, headers=5.17min, request=5min`);
    });
}