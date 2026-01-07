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
import { createMollieClient } from '@mollie/api-client';
import { sendReHomeOrderEmail, sendMovingRequestEmail } from "./notif.js";
import http from 'http'; // Import http module for server creation
import { authenticateUser } from './middleware/auth.js';
import * as imageProcessingService from './services/imageProcessingService.js';
import { warmUpCache } from './services/cacheService.js';
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

// CORS Configuration - Enable CORS for all routes and origins
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
}));

app.use(json()); // for parsing application/json
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // for parsing application/x-www-form-urlencoded

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

        // First, try to verify as custom JWT token
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
        
        try {
            const decoded = jwt.verify(token, jwtSecret);
            console.log('✅ Custom JWT token verified for admin check:', decoded.email);
            
            // ONLY check if email is in admin list - nothing else
            if (!ADMIN_EMAILS.includes(decoded.email)) {
                return res.status(403).json({ success: false, error: `Access denied. Email ${decoded.email} is not in admin list` });
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

            // ONLY check if email is in admin list - nothing else
            if (!ADMIN_EMAILS.includes(user.user.email)) {
                return res.status(403).json({ success: false, error: `Access denied. Email ${user.user.email} is not in admin list` });
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
    normal: Joi.number().required()
});

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
    daysUntilMove: Joi.number().optional()
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
import transportRoutes from './api/transport.js';
import pricingRoutes from './api/pricing.js';
import marketplaceRoutes from './api/marketplace.js';

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
app.use('/api/pricing', pricingRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/marketplace', marketplaceRoutes);

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

        // Get credentials from environment variables
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        // Validate redirect URI
        const allowedRedirectUris = [
            'http://localhost:5173/auth/google/callback',
            'https://www.rehomebv.com/auth/google/callback',
            'https://rehomebv.com/auth/google/callback'
        ];
        
        if (!allowedRedirectUris.includes(redirect_uri)) {
            console.error('❌ Invalid redirect URI:', redirect_uri);
            return res.status(400).json({ 
                error: 'Invalid redirect URI',
                details: 'The provided redirect URI is not in the allowed list'
            });
        }

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
        return res.status(400).json({ 
            error: "Email and password are required",
            userMessage: "Please provide both email and password to continue."
        });
    }

    try {
        console.log('🔐 Attempting login for:', email);
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error("Supabase auth error:", error);
            throw error;
        }

        if(data.session && data.session.access_token){
            console.log('✅ Login successful for:', email);
            res.json({ accessToken: data.session.access_token });
        } else {
            console.error("❌ Login failed: no access token returned");
            res.status(500).json({
                error: "Login failed: no access token",
                userMessage: "Authentication service error. Please try again."
            });
        }

    } catch (error) {
        console.error("Login error:", error);
        
        // Handle specific Supabase authentication errors
        if (error.message) {
            // Invalid login credentials (wrong password or email)
            if (error.message.includes('Invalid login credentials')) {
                return res.status(401).json({ 
                    error: error.message,
                    userMessage: "Invalid email or password. Please check your credentials and try again.",
                    errorType: "INVALID_CREDENTIALS"
                });
            }
            
            // User not found (email doesn't exist)
            if (error.message.includes('User not found')) {
                return res.status(401).json({ 
                    error: error.message,
                    userMessage: "No account found with this email address. Please check your email or create a new account.",
                    errorType: "USER_NOT_FOUND"
                });
            }
            
            // Email not confirmed
            if (error.message.includes('Email not confirmed')) {
                return res.status(401).json({ 
                    error: error.message,
                    userMessage: "Please verify your email address before signing in. Check your inbox for a confirmation email.",
                    errorType: "EMAIL_NOT_CONFIRMED"
                });
            }
            
            // Too many requests (rate limiting)
            if (error.message.includes('Too many requests')) {
                return res.status(429).json({ 
                    error: error.message,
                    userMessage: "Too many login attempts. Please wait a moment before trying again.",
                    errorType: "RATE_LIMITED"
                });
            }
            
            // Account locked/disabled
            if (error.message.includes('Account locked') || error.message.includes('disabled')) {
                return res.status(403).json({ 
                    error: error.message,
                    userMessage: "Your account has been temporarily locked. Please contact support for assistance.",
                    errorType: "ACCOUNT_LOCKED"
                });
            }
        }
        
        // Generic server error
        return res.status(500).json({ 
            error: error.message || "Internal server error",
            userMessage: "An unexpected error occurred. Please try again later.",
            errorType: "SERVER_ERROR"
        });
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
// 9. Item Moving Request Endpoint with Distance Calculation and Photo Upload
app.post('/api/item-moving-requests', upload.array('photos', 10), async (req, res) => {
    try {
      // Parse the JSON data from FormData
      const payload = JSON.parse(req.body.data);
      
      const {
        order_number,
        pickupType,
        furnitureItems,
        customItem,
        floorPickup,
        floorDropoff,
        contactInfo,
        estimatedPrice,
        selectedDateRange,
        isDateFlexible,
        pickupDate,
        dropoffDate,
        dateOption,
        preferredTimeSpan,
        extraInstructions,
        elevatorPickup,
        elevatorDropoff,
        disassembly,
        assembly,
        extraHelper,
        carryingService,
        isStudent,
        studentId,
        storeProofPhoto,
        disassemblyItems,
        assemblyItems,
        extraHelperItems,
        carryingServiceItems,
        basePrice,
        itemPoints,
        itemValue,
        carryingCost,
        disassemblyCost,
        distanceCost,
        extraHelperCost,
        studentDiscount,
        distanceKm,
        firstlocation,
        secondlocation,
        firstlocation_coords,
        secondlocation_coords,
        orderSummary,
      } = payload;
      console.log('📦 Item Moving Request - Full Body:', req.body);
      
      // Validate required fields
      if (!contactInfo || !contactInfo.email || !contactInfo.firstName || !contactInfo.lastName) {
        return res.status(400).json({ error: 'Contact information is required' });
      }

      // Handle date fields based on dateOption
      let selecteddate_start = null;
      let selecteddate_end = null;
      let selecteddate = null;
      let finalIsDateFlexible = Boolean(isDateFlexible);
      
      if (dateOption === 'rehome') {
        // Let ReHome choose - all dates NULL, isdateflexible = true
        selecteddate_start = null;
        selecteddate_end = null;
        selecteddate = null;
        finalIsDateFlexible = true;
      } else if (dateOption === 'flexible') {
        // Flexible date range - use selectedDateRange
        selecteddate_start = selectedDateRange?.start || null;
        selecteddate_end = selectedDateRange?.end || null;
        selecteddate = selectedDateRange?.start || null; // Legacy field
        finalIsDateFlexible = true;
      } else if (dateOption === 'fixed') {
        // Fixed dates - for item transport: pickup and dropoff dates
        selecteddate_start = pickupDate || selectedDateRange?.start || null;
        selecteddate_end = dropoffDate || null;
        selecteddate = pickupDate || selectedDateRange?.start || null; // Legacy field
        finalIsDateFlexible = false;
      }

      // Process uploaded photos
      let photoUrls = [];
      if (req.files && req.files.length > 0) {
        console.log('📸 Processing', req.files.length, 'uploaded photos for item moving request');
        
        for (const file of req.files) {
          try {
            // Convert image to web format and process with sharp
            const conversionResult = await imageProcessingService.convertImageToWebFormat(
              file.buffer,
              file.originalname,
              {
                quality: 85,
                maxWidth: 1920,
                maxHeight: 1080,
                removeMetadata: true
              }
            );
            const optimizedImageBuffer = conversionResult.buffer;
            
            // Upload to Supabase storage (upload buffer directly - Node.js doesn't have File API)
            const fileName = `item-moving/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('special-requests')
              .upload(fileName, optimizedImageBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: false
              });
            
            if (uploadError) {
              console.error('❌ Photo upload error:', uploadError);
              continue; // Skip this photo but continue with others
            }
            
            // Get the public URL
            const { data: { publicUrl } } = supabase.storage
              .from('special-requests')
              .getPublicUrl(fileName);
            
            photoUrls.push(publicUrl);
            console.log('✅ Photo uploaded successfully:', publicUrl);
          } catch (photoError) {
            console.error('❌ Error processing photo:', photoError);
            continue; // Skip this photo but continue with others
          }
        }
      }
      
      // Prepare data for database insertion
      const insertData = {
        order_number: order_number || null,
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
        selecteddate: selecteddate,
        isdateflexible: finalIsDateFlexible,
        selecteddate_start: selecteddate_start,
        selecteddate_end: selecteddate_end,
        date_option: dateOption || 'fixed',
        preferred_time_span: preferredTimeSpan || null,
        preferredtimespan: preferredTimeSpan || null,
        extra_instructions: extraInstructions || null,
        elevator_pickup: elevatorPickup || false,
        elevator_dropoff: elevatorDropoff || false,
        disassembly: disassembly || false,
        assembly: assembly || false,
        extra_helper: extraHelper || false,
        carrying_service: carryingService || false,
        is_student: isStudent || false,
        student_id: studentId ? studentId.name : null,
        store_proof_photo: storeProofPhoto ? storeProofPhoto.name : null,
        disassembly_items: disassemblyItems || null,
        assembly_items: assemblyItems || null,
        extra_helper_items: extraHelperItems || null,
        carrying_service_items: carryingServiceItems || null,
        baseprice: basePrice ? parseFloat(basePrice) : null,
        itempoints: itemPoints ? parseInt(itemPoints, 10) : null,
        itemvalue: itemValue ? parseFloat(itemValue) : null,
        carryingcost: carryingCost ? parseFloat(carryingCost) : null,
        disassemblycost: disassemblyCost ? parseFloat(disassemblyCost) : null,
        distancecost: distanceCost ? parseFloat(distanceCost) : null,
        extrahelpercost: extraHelperCost ? parseFloat(extraHelperCost) : null,
        studentdiscount: studentDiscount ? parseFloat(studentDiscount) : null,
        firstlocation: firstlocation || null,
        secondlocation: secondlocation || null,
        firstlocation_coords: firstlocation_coords || null,
        secondlocation_coords: secondlocation_coords || null,
        calculated_distance_km: distanceKm,
        photo_urls: photoUrls
      };


      console.log('💾 Inserting item moving request into database...');

      const { data, error } = await supabase
        .from('item_moving')
        .insert([insertData])
        .select();

      if (error) {
        console.error('❌ Database insert error:', error);
        throw error;
      }

      console.log('✅ Item moving request saved successfully');
      
      // Send confirmation email
      try {
        const emailResult = await sendMovingRequestEmail({
          customerEmail: contactInfo.email,
          customerFirstName: contactInfo.firstName,
          customerLastName: contactInfo.lastName,
          serviceType: 'item-moving',
          pickupLocation: firstlocation,
          dropoffLocation: secondlocation,
          selectedDateRange,
          isDateFlexible,
          estimatedPrice: estimatedPrice || 0,
          orderSummary,
          order_number: order_number,
          distanceInfo: null
        });
        
        if (emailResult.success) {
          console.log('✅ Item moving confirmation email sent successfully');
        } else {
          console.error('❌ Failed to send item moving confirmation email:', emailResult.error);
        }
      } catch (emailError) {
        console.error('❌ Error sending item moving confirmation email:', emailError);
      }
      
      // Return response with distance data included
      const response = {
        ...data[0],
        distanceCalculation: null
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('❌ Error saving item moving request:', error);
      res.status(500).json({ 
        error: 'Failed to save moving request',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
// HOUSE Moving Request Endpoint with Distance Calculation and Photo Upload
  app.post('/api/house-moving-requests', upload.array('photos', 10), async (req, res) => {
    try {
    // Parse the JSON data from FormData
    const payload = JSON.parse(req.body.data);
    
    const {
        order_number,
        pickupType,
        furnitureItems,
        customItem,
        floorPickup,
        floorDropoff,
        contactInfo,
        estimatedPrice,
        selectedDateRange,
        isDateFlexible,
        dateOption,
        preferredTimeSpan,
        extraInstructions,
        elevatorPickup,
        elevatorDropoff,
        disassembly,
        assembly,
        extraHelper,
        carryingService,
        isStudent,
        studentId,
        storeProofPhoto,
        disassemblyItems,
        assemblyItems,
        extraHelperItems,
        carryingServiceItems,
        basePrice,
        itemPoints,
        itemValue,
        carryingCost,
        disassemblyCost,
        distanceCost,
        extraHelperCost,
        studentDiscount,
        firstlocation,
        secondlocation,
        firstlocation_coords,
        secondlocation_coords,
        orderSummary,
        distanceKm
    } = payload;
    
    console.log('🏠 House Moving Request - Full Body:', req.body);
    
    // Handle date fields based on dateOption
    let selecteddate_start = null;
    let selecteddate_end = null;
    let selecteddate = null;
    let finalIsDateFlexible = Boolean(isDateFlexible);
    
    if (dateOption === 'rehome') {
      // Let ReHome choose - all dates NULL, isdateflexible = true
      selecteddate_start = null;
      selecteddate_end = null;
      selecteddate = null;
      finalIsDateFlexible = true;
    } else if (dateOption === 'flexible') {
      // Flexible date range - use selectedDateRange
      selecteddate_start = selectedDateRange?.start || null;
      selecteddate_end = selectedDateRange?.end || null;
      selecteddate = selectedDateRange?.start || null; // Legacy field
      finalIsDateFlexible = true;
    } else if (dateOption === 'fixed') {
      // Fixed date - for house moving: single moving date (start only)
      selecteddate_start = selectedDateRange?.start || null;
      selecteddate_end = null; // House moving fixed date has no end date
      selecteddate = selectedDateRange?.start || null; // Legacy field
      finalIsDateFlexible = false;
    }

    // Process uploaded photos
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      console.log('📸 Processing', req.files.length, 'uploaded photos for house moving request');
      
      for (const file of req.files) {
        try {
          // Convert image to web format and process with sharp
          const conversionResult = await imageProcessingService.convertImageToWebFormat(
            file.buffer,
            file.originalname,
            {
              quality: 85,
              maxWidth: 1920,
              maxHeight: 1080,
              removeMetadata: true
            }
          );
          const optimizedImageBuffer = conversionResult.buffer;
          
          // Upload to Supabase storage (upload buffer directly - Node.js doesn't have File API)
          const fileName = `house-moving/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('special-requests')
            .upload(fileName, optimizedImageBuffer, {
              contentType: 'image/jpeg',
              cacheControl: '3600',
              upsert: false
            });
          
          if (uploadError) {
            console.error('❌ Photo upload error:', uploadError);
            continue; // Skip this photo but continue with others
          }
          
          // Get the public URL
          const { data: { publicUrl } } = supabase.storage
            .from('special-requests')
            .getPublicUrl(fileName);
          
          photoUrls.push(publicUrl);
          console.log('✅ Photo uploaded successfully:', publicUrl);
        } catch (photoError) {
          console.error('❌ Error processing photo:', photoError);
          continue; // Skip this photo but continue with others
        }
      }
    }

    console.log('📦 House first and second location Request - Full Body:', firstlocation, secondlocation);
    // Prepare data for database insertion
    const insertData = {
      order_number: order_number || null,
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
      selecteddate: selecteddate,
      selecteddate_start: selecteddate_start,
      selecteddate_end: selecteddate_end,
      isdateflexible: finalIsDateFlexible,
      date_option: dateOption || 'fixed',
      preferred_time_span: preferredTimeSpan || null,
      preferredtimespan: preferredTimeSpan || null,
      extra_instructions: extraInstructions || null,
      elevator_pickup: elevatorPickup || false,
      elevator_dropoff: elevatorDropoff || false,
      disassembly: disassembly || false,
      assembly: assembly || false,
      extra_helper: extraHelper || false,
      carrying_service: carryingService || false,
      is_student: isStudent || false,
      student_id: studentId ? studentId.name : null,
      store_proof_photo: storeProofPhoto ? storeProofPhoto.name : null,
      disassembly_items: disassemblyItems || null,
      assembly_items: assemblyItems || null,
      extra_helper_items: extraHelperItems || null,
      carrying_service_items: carryingServiceItems || null,
      baseprice: basePrice ? parseFloat(basePrice) : null,
      itempoints: itemPoints ? parseInt(itemPoints, 10) : null,
      itemvalue: itemValue ? parseFloat(itemValue) : null,
      carryingcost: carryingCost ? parseFloat(carryingCost) : null,
      disassemblycost: disassemblyCost ? parseFloat(disassemblyCost) : null,
      distancecost: distanceCost ? parseFloat(distanceCost) : null,
      extrahelpercost: extraHelperCost ? parseFloat(extraHelperCost) : null,
      studentdiscount: studentDiscount ? parseFloat(studentDiscount) : null,
      firstlocation: firstlocation || null,
      secondlocation: secondlocation || null,
      firstlocation_coords: firstlocation_coords || null,
      secondlocation_coords: secondlocation_coords || null,
      calculated_distance_km: distanceKm,
      photo_urls: photoUrls
    };
     

    const { data, error } = await supabase
        .from('house_moving')
        .insert([insertData])
        .select();

    if (error) {
      console.error('❌ Database insert error:', error);
      throw error;
    }

    console.log('✅ House moving request saved successfully');

    // Send confirmation email
    try {
      const distanceInfo = (typeof insertData.calculated_distance_km === 'number' && !isNaN(insertData.calculated_distance_km)) ? {
        distance: `${insertData.calculated_distance_km} km`,
        duration: null // Duration not available from frontend
      } : null;
      const emailResult = await sendMovingRequestEmail({
        customerEmail: contactInfo.email,
        customerFirstName: contactInfo.firstName,
        customerLastName: contactInfo.lastName,
        serviceType: 'house-moving',
        pickupLocation: firstlocation,
        dropoffLocation: secondlocation,
        selectedDateRange,
        isDateFlexible,
        estimatedPrice: estimatedPrice || 0,
        orderSummary,
        order_number: order_number,
        distanceInfo
      });
      
      if (emailResult.success) {
        console.log('✅ House moving confirmation email sent successfully');
      } else {
        console.error('❌ Failed to send house moving confirmation email:', emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending house moving confirmation email:', emailError);
    }

    // Return response with distance data included
    const response = {
      ...data[0],
      distanceCalculation: (typeof insertData.calculated_distance_km === 'number' && !isNaN(insertData.calculated_distance_km)) ? {
        success: true,
        distance: `${insertData.calculated_distance_km} km`,
        duration: null,
        provider: 'frontend'
      } : null
    };

    res.status(201).json(response);
    } catch (error) {
    console.error('❌ Error saving house moving request:', error);
    res.status(500).json({ 
      error: 'Failed to save moving request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
                          console.error(`🔄 Compression attempt ${attempts} failed:`, compressionError.message);
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
              
              const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('furniture-images')
                .upload(finalFilename, finalBuffer, {
                  contentType: finalMimeType
                });

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

// 7. Special Request Endpoint with Distance Calculation and Photo Upload
app.post('/api/special-requests', (req, res, next) => {
    // Handle multer errors for photo uploads
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
  console.log('🎯 Special Request - Full Body:', req.body);
  console.log('📤 Special Request - Files:', req.files?.length || 0);

  // Extract form data - since we're using FormData from frontend
  const selectedService = req.body.service;
  const phone = req.body.phone;
  const email = req.body.email;
  
  // Extract other dynamic fields
  const fields = {};
  Object.keys(req.body).forEach(key => {
    if (!['service', 'phone', 'email'].includes(key)) {
      fields[key] = req.body[key];
    }
  });

  // Declare insertData variable
  let insertData = {};

  // Handle fullInternationalMove service type specifically
  if (selectedService === 'fullInternationalMove') {
    console.log('🌍 Processing Full/International Move request');
    
    // Extract all the specific fields for international move
    const pickupAddress = fields.pickupAddress || '';
    const dropoffAddress = fields.dropoffAddress || '';
    const pickupFloor = fields.pickupFloor || 0;
    const dropoffFloor = fields.dropoffFloor || 0;
    const pickupElevator = fields.pickupElevator || 'no';
    const dropoffElevator = fields.dropoffElevator || 'no';
    const itemDescription = fields.itemDescription || '';
    const moveDateType = fields.moveDateType || '';
    const specificDate = fields.specificDate || null;
    const flexibleStartDate = fields.flexibleStartDate || null;
    const flexibleEndDate = fields.flexibleEndDate || null;
    const rehomeChooseDate = fields.rehomeChooseDate === 'true';
    
    // Parse selected services
    let selectedServices = [];
    if (fields.selectedServices) {
      try {
        selectedServices = JSON.parse(fields.selectedServices);
      } catch (e) {
        console.error('Error parsing selectedServices:', e);
        selectedServices = [];
      }
    }

    // Determine the preferred date based on move date type
    let preferredDate = null;
    let isDateFlexible = false;
    
    if (moveDateType === 'specific' && specificDate) {
      preferredDate = specificDate;
      isDateFlexible = false;
    } else if (moveDateType === 'flexible' && flexibleStartDate && flexibleEndDate) {
      preferredDate = flexibleStartDate; // Use start date as preferred
      isDateFlexible = true;
    } else if (moveDateType === 'rehomeChoose' || rehomeChooseDate) {
      preferredDate = null;
      isDateFlexible = true;
    }

    // Prepare data for database insertion
    insertData = {
      selected_services: ['fullInternationalMove', ...selectedServices],
      message: itemDescription,
      contact_info: { phone, email },
      pickup_location: pickupAddress,
      dropoff_location: dropoffAddress,
      pickup_location_coords: null, // Will be added if coordinates are available
      dropoff_location_coords: null, // Will be added if coordinates are available
      request_type: 'fullInternationalMove',
      preferred_date: preferredDate,
      is_date_flexible: isDateFlexible,
      // Additional fields specific to international move
      pickup_floor: parseInt(pickupFloor) || 0,
      dropoff_floor: parseInt(dropoffFloor) || 0,
      pickup_elevator: pickupElevator,
      dropoff_elevator: dropoffElevator,
      move_date_type: moveDateType,
      specific_date: specificDate,
      flexible_start_date: flexibleStartDate,
      flexible_end_date: flexibleEndDate,
      rehome_choose_date: rehomeChooseDate,
      selected_services_details: selectedServices,
      created_at: new Date().toISOString()
    };
  } else {
    // Handle other service types (storage, junkRemoval) as before
    const selectedServices = fields.services ? [fields.services] : [selectedService];
    const message = fields.itemDescription || fields.itemList || fields.message || '';
    const contactInfo = { phone, email };
    const pickupLocation = fields.pickupAddress || fields.address || '';
    const dropoffLocation = fields.dropoffAddress || fields.dropoffPreference || '';
    const pickupLocationCoords = fields.pickupLocationCoords || null;
    const dropoffLocationCoords = fields.dropoffLocationCoords || null;
    const requestType = selectedService;
    const preferredDate = fields.removalDate || fields.preferredDate || null;
    const isDateFlexible = fields.isDateFlexible || false;

    // Prepare data for database insertion
    insertData = {
      selected_services: selectedServices,
      message: message,
      contact_info: contactInfo,
      pickup_location: pickupLocation || null,
      dropoff_location: dropoffLocation || null,
      pickup_location_coords: pickupLocationCoords || null,
      dropoff_location_coords: dropoffLocationCoords || null,
      request_type: requestType || null,
      preferred_date: preferredDate || null,
      is_date_flexible: Boolean(isDateFlexible),
      created_at: new Date().toISOString()
    };
  }

  try {
    // Process photo uploads if any
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Processing ${req.files.length} photos for special request...`);
      
      // Check if special-requests bucket exists
      const { data: bucketData, error: bucketError } = await supabaseClient.storage.getBucket('special-requests');
      
      if (bucketError) {
        console.error('Special requests bucket error:', bucketError);
        return res.status(500).json({ error: 'Storage bucket not accessible', details: bucketError });
      }

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        console.log(`\n📸 Processing photo ${i + 1}/${req.files.length}: ${file.originalname}`);
        
        try {
          // Check if the image format is supported
          const isSupported = imageProcessingService.isImageFormatSupported(file.originalname);
          console.log(`📸 Format supported: ${isSupported} (${file.originalname})`);
          
          let finalBuffer = file.buffer;
          let finalFilename = file.originalname;
          let finalMimeType = file.mimetype;
          
          // Always process images for optimization and format conversion
          console.log(`📸 Processing image: ${file.originalname} (Original size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)`);
          
          let conversionResult;
          
          // Convert unsupported formats (HEIC, etc.) or optimize all images
          if (!isSupported || file.originalname.toLowerCase().includes('.heic')) {
            console.log(`📸 Converting unsupported format: ${file.originalname}`);
            
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
            console.log(`📸 Optimizing supported image: ${file.originalname}`);
            
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
            console.log(`📸 File still over 2MB (${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB), applying aggressive compression...`);
            
            let currentBuffer = finalBuffer;
            let quality = 70;
            let maxWidth = 1600;
            let maxHeight = 1200;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (currentBuffer.length > targetSizeInBytes && attempts < maxAttempts) {
              attempts++;
              console.log(`📸 Compression attempt ${attempts}/${maxAttempts} - Quality: ${quality}, Max dimensions: ${maxWidth}x${maxHeight}`);
              
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
                console.log(`📸 After compression attempt ${attempts}: ${(currentBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                
                // Reduce quality and dimensions for next attempt
                quality = Math.max(30, quality - 10);
                maxWidth = Math.max(800, maxWidth - 200);
                maxHeight = Math.max(600, maxHeight - 150);
                
              } catch (compressionError) {
                console.error(`📸 Compression attempt ${attempts} failed:`, compressionError.message);
                break;
              }
            }
            
            // Update final values
            finalBuffer = currentBuffer;
            finalMimeType = 'image/jpeg';
            finalFilename = finalFilename.replace(/\.(png|webp|gif)$/i, '.jpg');
            
            if (finalBuffer.length > targetSizeInBytes) {
              console.log(`📸 Warning: File still over 2MB after ${maxAttempts} attempts. Final size: ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            } else {
              console.log(`📸 Successfully compressed to ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            }
          }
          
          // Calculate size reduction
          const sizeReduction = Math.round((1 - finalBuffer.length / file.buffer.length) * 100);
          console.log(`📸 Size reduction: ${sizeReduction}% (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB → ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
          
          console.log(`📸 Processing completed: ${file.originalname} -> ${finalFilename}`);

          // Upload the processed image
          console.log(`📤 Uploading: ${finalFilename} (${finalBuffer.length} bytes)`);
          
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('special-requests')
            .upload(finalFilename, finalBuffer, {
              contentType: finalMimeType
            });

          if (uploadError) {
            console.error(`📸 Error uploading processed file:`, uploadError);
            throw uploadError;
          }
          
          console.log('📸 Upload successful:', uploadData);
          const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/special-requests/${finalFilename}`;
          console.log('📸 Generated image URL:', imageUrl);
          photoUrls.push(imageUrl);

        } catch (photoError) {
          console.error(`📸 Error processing file ${file.originalname}:`, photoError);
          // Continue with other photos even if one fails
        }
      }
      
      console.log(`📸 Successfully uploaded ${photoUrls.length}/${req.files.length} photos`);
    }

    // Add photo URLs to insert data
    if (photoUrls.length > 0) {
      insertData.photo_urls = photoUrls;
    }

    console.log('💾 Inserting special request into database...');

    const { data, error } = await supabase
      .from('services')
      .insert([insertData])
      .select();

    if (error) {
      console.error('❌ Database insert error:', error);
      return res.status(500).json({ 
        error: 'Failed to save special request.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    console.log('✅ Special request saved successfully');

    // Return response with distance data included
    const response = {
      message: 'Special request saved successfully.',
      data: data[0],
      distanceCalculation: null
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('❌ Error in special request endpoint:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 8. Item Donation Request Endpoint with Distance Calculation (REMOVED DUPLICATE)

// Get item donation requests (admin endpoint)
app.get('/api/item-donation-requests', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📋 Fetching item donation requests for user:', userEmail);

    let query = supabase
      .from('item_donations')
      .select('*')
      .order('created_at', { ascending: false });

    // If not admin, filter by user's email
    if (!isAdmin(userEmail)) {
      query = query.eq('contact_info->>email', userEmail);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching donation requests:', error);
      
      // If table doesn't exist, return empty array for now
      if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.log('⚠️ Item donations table does not exist yet');
        return res.json([]);
      }
      
      return res.status(500).json({ 
        error: 'Failed to fetch donation requests',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    console.log('✅ Found donation requests:', data?.length || 0);
    res.json(data || []);
  } catch (err) {
    console.error('❌ Error fetching donation requests:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update item donation request status (admin endpoint)
app.put('/api/item-donation-requests/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const userEmail = req.user.email;

    if (!isAdmin(userEmail)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!['pending', 'approved', 'rejected', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    console.log('📝 Updating donation request status:', { id, status, adminNotes });

    const { data, error } = await supabase
      .from('item_donations')
      .update({ 
        status, 
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('❌ Error updating donation status:', error);
      return res.status(500).json({ 
        error: 'Failed to update donation status',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    console.log('✅ Donation status updated successfully');
    res.json({ message: 'Donation status updated successfully', data: data[0] });
  } catch (err) {
    console.error('❌ Error updating donation status:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get special requests (admin endpoint)
app.get('/api/special-requests', authenticateUser, async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log('📋 Fetching special requests for user:', userEmail);

    let query = supabase
      .from('services') // Changed from 'special_requests' to 'services'
      .select('*')
      .order('created_at', { ascending: false });

    // If not admin, filter by user's email
    if (!isAdmin(userEmail)) {
      query = query.eq('contact_info->>email', userEmail);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching special requests:', error);
      // If table doesn't exist, return empty array for now
      if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.log('⚠️ Special requests table does not exist yet');
        return res.json([]);
      }
      return res.status(500).json({ 
        error: 'Failed to fetch special requests',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    console.log('✅ Found special requests:', data?.length || 0);
    res.json(data || []);
  } catch (err) {
    console.error('❌ Error fetching special requests:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update special request status (admin endpoint)
app.put('/api/special-requests/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const userEmail = req.user.email;

    if (!isAdmin(userEmail)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!['pending', 'approved', 'rejected', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    console.log('📝 Updating special request status:', { id, status, adminNotes });

    const { data, error } = await supabase
      .from('services')
      .update({ 
        status, 
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('❌ Error updating special request status:', error);
      return res.status(500).json({ 
        error: 'Failed to update special request status',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    console.log('✅ Special request status updated successfully');
    res.json({ message: 'Special request status updated successfully', data: data[0] });
  } catch (err) {
    console.error('❌ Error updating special request status:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 9. Mark Furniture as Sold and Move to Sold Items
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

        const { cityName, normal } = req.body;
        const insertData = { city_name: cityName, normal };

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
        const { normal } = req.body;
        
        if (!normal) {
            return res.status(400).json({ success: false, error: "Normal charge is required" });
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
            .update({ normal })
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
            daysUntilMove
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

        // Get furniture items and calculate base cost
        const { data: furnitureItems, error: furnitureError } = await supabaseClient
            .from('furniture_items')
            .select('*');

        if (furnitureError) {
            return res.status(500).json({ success: false, error: "Error fetching furniture data" });
        }

        // Determine if city is scheduled on the selected date
        let isCityScheduled = false;
        if (selectedDate && pickupLocation) {
            const { data: scheduleRow, error: scheduleError } = await supabaseClient
                .from('city_schedules')
                .select('id')
                .eq('city', pickupLocation)
                .eq('date', selectedDate)
                .maybeSingle();

            if (scheduleError) {
                console.error('Error fetching city_schedules for pricing:', scheduleError);
            }

            isCityScheduled = Boolean(scheduleRow);
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
            daysUntilMove,
            config,
            cityCharge,
            isCityScheduled,
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
        daysUntilMove,
        config,
        cityCharge,
        isCityScheduled,
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
    const isCityDay = isCityScheduled;

    // Base charge
    const baseCharge = isCityDay && cityCharge.city_day != null
        ? cityCharge.city_day
        : cityCharge.normal;

    // Calculate point-based cost
    const pointBasedCost = totalPoints * config.baseMultipliers.houseMovingItemMultiplier * (baseCharge / 10); // Normalize base charge

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

    // Late booking fee (€50 for 1-3 days, €75 for same/next day)
    let lateBookingFee = 0;
    if (daysUntilMove !== undefined && daysUntilMove <= 3) {
        if (daysUntilMove <= 1) {
            lateBookingFee = 75; // Urgent booking fee
        } else {
            lateBookingFee = 50; // Late booking fee
        }
    }

    // Apply discounts and fees
    subtotal = subtotal - studentDiscountAmount + lateBookingFee;

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
            lateBookingFee: parseFloat(lateBookingFee.toFixed(2)),
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

// ==================== DISTANCE CALCULATION HELPER FUNCTION ====================

// Helper function to calculate distance between two locations
const calculateDistanceBetweenLocations = async (origin, destination) => {
    try {
        if (!origin || !destination) {
            return {
                success: false,
                error: 'Origin and destination are required'
            };
        }

        console.log('🛣️ Calculating road distance from:', origin, 'to:', destination);

        // Parse coordinates from origin and destination
        const [originLat, originLng] = origin.split(',').map(parseFloat);
        const [destLat, destLng] = destination.split(',').map(parseFloat);

        // First, try Google Routes API
        const apiKey = process.env.GOOGLE_MAPS_API || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API;
        
        if (apiKey) {
            try {
                console.log('🔵 Trying Google Routes API...');
                
                const requestBody = {
                    origin: {
                        location: {
                            latLng: {
                                latitude: originLat,
                                longitude: originLng
                            }
                        }
                    },
                    destination: {
                        location: {
                            latLng: {
                                latitude: destLat,
                                longitude: destLng
                            }
                        }
                    },
                    travelMode: 'DRIVE',
                    routingPreference: 'TRAFFIC_UNAWARE',
                    computeAlternativeRoutes: false,
                    routeModifiers: {
                        avoidTolls: true,
                        avoidHighways: false,
                        avoidFerries: false
                    },
                    languageCode: 'en-US',
                    units: 'METRIC'
                };

                const response = await axios.post(
                    'https://routes.googleapis.com/directions/v2:computeRoutes',
                    requestBody,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Goog-Api-Key': apiKey,
                            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
                        },
                        timeout: 10000 // 10 second timeout
                    }
                );

                if (response.data.routes && response.data.routes.length > 0) {
                    const route = response.data.routes[0];
                    const distanceMeters = route.distanceMeters;
                    const distanceKm = distanceMeters / 1000;
                    const durationSeconds = parseInt(route.duration.replace('s', ''));

                    console.log('✅ Google Routes API success:', distanceKm.toFixed(2), 'km');

                    // Format duration for display
                    const hours = Math.floor(durationSeconds / 3600);
                    const minutes = Math.floor((durationSeconds % 3600) / 60);
                    let durationText = '';
                    if (hours > 0) {
                        durationText = `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
                    } else {
                        durationText = `${minutes} min${minutes !== 1 ? 's' : ''}`;
                    }

                    return {
                        success: true,
                        distance: distanceMeters,
                        distanceKm: Math.round(distanceKm * 100) / 100,
                        duration: durationSeconds,
                        durationText: durationText,
                        distanceText: `${distanceKm.toFixed(1)} km`,
                        origin: origin,
                        destination: destination,
                        provider: 'Google Routes API'
                    };
                }
            } catch (googleError) {
                console.log('⚠️ Google Routes API failed:', googleError.message);
                console.log('🔄 Falling back to OpenRouteService...');
            }
        } else {
            console.log('⚠️ No Google Maps API key found, using OpenRouteService...');
        }

        // Fallback to OpenRouteService
        try {
            console.log('🟡 Trying OpenRouteService...');
            
            // OpenRouteService expects coordinates as lng,lat (opposite of lat,lng)
            const openRouteUrl = `https://api.openrouteservice.org/v2/directions/driving-car`;
            const params = {
                start: `${originLng},${originLat}`,
                end: `${destLng},${destLat}`
            };

            const response = await axios.get(openRouteUrl, {
                params: params,
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.data.features && response.data.features.length > 0) {
                const route = response.data.features[0];
                const distanceMeters = route.properties.segments[0].distance;
                const durationSeconds = route.properties.segments[0].duration;
                const distanceKm = distanceMeters / 1000;

                console.log('✅ OpenRouteService success:', distanceKm.toFixed(2), 'km');

                // Format duration for display
                const hours = Math.floor(durationSeconds / 3600);
                const minutes = Math.floor((durationSeconds % 3600) / 60);
                let durationText = '';
                if (hours > 0) {
                    durationText = `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`;
                } else {
                    durationText = `${minutes} min${minutes !== 1 ? 's' : ''}`;
                }

                return {
                    success: true,
                    distance: distanceMeters,
                    distanceKm: Math.round(distanceKm * 100) / 100,
                    duration: durationSeconds,
                    durationText: durationText,
                    distanceText: `${distanceKm.toFixed(1)} km`,
                    origin: origin,
                    destination: destination,
                    provider: 'OpenRouteService'
                };
            } else {
                throw new Error('No routes found in OpenRouteService response');
            }

        } catch (openRouteError) {
            console.error('❌ OpenRouteService also failed:', openRouteError.message);
            
            // If both services fail, return error
            return {
                success: false,
                error: 'All distance calculation services failed',
                details: process.env.NODE_ENV === 'development' ? {
                    googleError: apiKey ? 'Google Routes API failed' : 'No Google API key',
                    openRouteError: openRouteError.message
                } : undefined
            };
        }

    } catch (error) {
        console.error('❌ Unexpected error calculating distance:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return {
                success: false,
                error: 'Request timeout - Distance calculation service took too long to respond'
            };
        }

        return {
            success: false,
            error: 'Failed to calculate distance',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message
            } : undefined
        };
    }
};

// ==================== DISTANCE CALCULATION ENDPOINT ====================

// Calculate road distance between two locations using Google Routes API with OpenRouteService fallback
app.post('/api/calculate-distance', async (req, res) => {
    try {
        const { origin, destination, originPlaceId, destinationPlaceId } = req.body;

        const result = await calculateDistanceBetweenLocations(origin, destination);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('❌ Distance calculation endpoint error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate distance',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message
            } : undefined
        });
    }
});

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

// ==================== COST-EFFECTIVE LOCATION AUTOCOMPLETE ====================

// Get location suggestions from database and hardcoded cities (no external API costs)
app.get('/api/locations/autocomplete', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const query = q.toLowerCase().trim();
    console.log('🔍 Location autocomplete query:', query);
    
    // Comprehensive Dutch cities database with coordinates
    const dutchCitiesDatabase = {
      // Major cities
      'amsterdam': { lat: 52.3676, lon: 4.9041, postcode: '1000' },
      'rotterdam': { lat: 51.9225, lon: 4.4792, postcode: '3000' },
      'den haag': { lat: 52.0705, lon: 4.3007, postcode: '2500' },
      'the hague': { lat: 52.0705, lon: 4.3007, postcode: '2500' },
      'utrecht': { lat: 52.0907, lon: 5.1214, postcode: '3500' },
      'eindhoven': { lat: 51.4416, lon: 5.4697, postcode: '5600' },
      'tilburg': { lat: 51.5555, lon: 5.0913, postcode: '5000' },
      'groningen': { lat: 53.2194, lon: 6.5665, postcode: '9700' },
      'almere': { lat: 52.3508, lon: 5.2647, postcode: '1300' },
      'breda': { lat: 51.5719, lon: 4.7683, postcode: '4800' },
      'nijmegen': { lat: 51.8426, lon: 5.8518, postcode: '6500' },
      'enschede': { lat: 52.2232, lon: 6.8937, postcode: '7500' },
      'haarlem': { lat: 52.3874, lon: 4.6462, postcode: '2000' },
      'arnhem': { lat: 51.9851, lon: 5.8987, postcode: '6800' },
      'zaanstad': { lat: 52.4389, lon: 4.8167, postcode: '1500' },
      'amersfoort': { lat: 52.1561, lon: 5.3878, postcode: '3800' },
      'apeldoorn': { lat: 52.2112, lon: 5.9699, postcode: '7300' },
      'hoofddorp': { lat: 52.3030, lon: 4.6890, postcode: '2130' },
      'maastricht': { lat: 50.8514, lon: 5.6910, postcode: '6200' },
      'leiden': { lat: 52.1601, lon: 4.4970, postcode: '2300' },
      'dordrecht': { lat: 51.8133, lon: 4.6901, postcode: '3300' },
      'zoetermeer': { lat: 52.0575, lon: 4.4935, postcode: '2700' },
      'zwolle': { lat: 52.5168, lon: 6.0830, postcode: '8000' },
      'deventer': { lat: 52.2551, lon: 6.1639, postcode: '7400' },
      'delft': { lat: 52.0116, lon: 4.3571, postcode: '2600' },
      'alkmaar': { lat: 52.6318, lon: 4.7483, postcode: '1800' },
      'leeuwarden': { lat: 53.2012, lon: 5.8086, postcode: '8900' },
      'venlo': { lat: 51.3704, lon: 6.1724, postcode: '5900' },
      'oss': { lat: 51.7649, lon: 5.5178, postcode: '5340' },
      'roosendaal': { lat: 51.5308, lon: 4.4653, postcode: '4700' },
      'emmen': { lat: 52.7795, lon: 6.9093, postcode: '7800' },
      'hilversum': { lat: 52.2242, lon: 5.1758, postcode: '1200' },
      'kampen': { lat: 52.5551, lon: 5.9114, postcode: '8260' },
      'helmond': { lat: 51.4816, lon: 5.6611, postcode: '5700' },
      'gouda': { lat: 52.0115, lon: 4.7077, postcode: '2800' },
      'purmerend': { lat: 52.5050, lon: 4.9592, postcode: '1440' },
      'vlaardingen': { lat: 51.9128, lon: 4.3418, postcode: '3130' },
      'alphen aan den rijn': { lat: 52.1265, lon: 4.6575, postcode: '2400' },
      'spijkenisse': { lat: 51.8447, lon: 4.3298, postcode: '3200' },
      'hoorn': { lat: 52.6425, lon: 5.0597, postcode: '1620' },
      'ede': { lat: 52.0341, lon: 5.6580, postcode: '6710' },
      'leidschendam': { lat: 52.0894, lon: 4.3890, postcode: '2260' },
      'woerden': { lat: 52.0852, lon: 4.8836, postcode: '3440' },
      'schiedam': { lat: 51.9192, lon: 4.3886, postcode: '3100' },
      'lelystad': { lat: 52.5084, lon: 5.4750, postcode: '8200' },
      'tiel': { lat: 51.8861, lon: 5.4306, postcode: '4000' },
      'barneveld': { lat: 52.1386, lon: 5.5914, postcode: '3770' },
      'veenendaal': { lat: 52.0287, lon: 5.5636, postcode: '3900' },
      'doetinchem': { lat: 51.9648, lon: 6.2886, postcode: '7000' },
      'almelo': { lat: 52.3507, lon: 6.6678, postcode: '7600' },
      'nieuwegein': { lat: 52.0209, lon: 5.0937, postcode: '3430' },
      'zeist': { lat: 52.0889, lon: 5.2317, postcode: '3700' },
      's-hertogenbosch': { lat: 51.6906, lon: 5.2936, postcode: '5200' },
      'den bosch': { lat: 51.6906, lon: 5.2936, postcode: '5200' }
    };
    
    let suggestions = [];
    
    // 1. Get cities from database (marketplace furniture cities)
    try {
      console.log('🔄 Searching database cities...');
      const { data: dbCities, error: dbError } = await supabaseClient
        .from('marketplace_furniture')
        .select('city_name')
        .ilike('city_name', `%${query}%`)
        .limit(parseInt(limit));
      
      if (!dbError && dbCities) {
        const uniqueDbCities = [...new Set(dbCities.map(item => item.city_name))];
        console.log('📋 Found database cities:', uniqueDbCities.length);
        
        suggestions.push(...uniqueDbCities.map(city => {
          const cityKey = city.toLowerCase();
          const coords = dutchCitiesDatabase[cityKey] || { lat: 52.1, lon: 5.1, postcode: '0000' };
          
          return {
            display_name: `${city}, Netherlands`,
            lat: coords.lat.toString(),
            lon: coords.lon.toString(),
            place_id: `db_${cityKey}`,
            address: {
              city: city,
              postcode: coords.postcode,
              country: 'Netherlands'
            },
            source: 'database'
          };
        }));
      }
    } catch (dbError) {
      console.log('⚠️ Database city search failed:', dbError.message);
    }
    
    // 2. Get cities from pricing database
    try {
      console.log('🔄 Searching pricing cities...');
      const { data: pricingCities, error: pricingError } = await supabaseClient
        .from('city_base_charges')
        .select('city_name')
        .ilike('city_name', `%${query}%`)
        .limit(parseInt(limit));
      
      if (!pricingError && pricingCities) {
        console.log('📋 Found pricing cities:', pricingCities.length);
        
        suggestions.push(...pricingCities.map(item => {
          const city = item.city_name;
          const cityKey = city.toLowerCase();
          const coords = dutchCitiesDatabase[cityKey] || { lat: 52.1, lon: 5.1, postcode: '0000' };
          
          return {
            display_name: `${city}, Netherlands`,
            lat: coords.lat.toString(),
            lon: coords.lon.toString(),
            place_id: `pricing_${cityKey}`,
            address: {
              city: city,
              postcode: coords.postcode,
              country: 'Netherlands'
            },
            source: 'pricing'
          };
        }));
      }
    } catch (pricingError) {
      console.log('⚠️ Pricing city search failed:', pricingError.message);
    }
    
    // 3. Search hardcoded Dutch cities database
    console.log('🔄 Searching hardcoded cities...');
    const hardcodedMatches = Object.entries(dutchCitiesDatabase)
      .filter(([cityKey, coords]) => 
        cityKey.includes(query) || 
        cityKey.startsWith(query)
      )
      .sort(([a], [b]) => {
        // Prioritize starts-with matches
        const aStarts = a.startsWith(query);
        const bStarts = b.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.length - b.length; // Then sort by length
      })
      .slice(0, parseInt(limit))
      .map(([cityKey, coords]) => {
        const cityName = cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
        return {
          display_name: `${cityName}, Netherlands`,
          lat: coords.lat.toString(),
          lon: coords.lon.toString(),
          place_id: `hardcoded_${cityKey}`,
          address: {
            city: cityName,
            postcode: coords.postcode,
            country: 'Netherlands'
          },
          source: 'hardcoded'
        };
      });
    
    suggestions.push(...hardcodedMatches);
    console.log('📋 Found hardcoded cities:', hardcodedMatches.length);
    
    // 4. Remove duplicates and prioritize
    const seen = new Set();
    const uniqueSuggestions = suggestions.filter(suggestion => {
      const key = suggestion.address.city.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // 5. Sort by relevance and source priority
    uniqueSuggestions.sort((a, b) => {
      const aCity = a.address.city.toLowerCase();
      const bCity = b.address.city.toLowerCase();
      
      // Exact matches first
      if (aCity === query && bCity !== query) return -1;
      if (aCity !== query && bCity === query) return 1;
      
      // Starts with query
      if (aCity.startsWith(query) && !bCity.startsWith(query)) return -1;
      if (!aCity.startsWith(query) && bCity.startsWith(query)) return 1;
      
      // Source priority: database > pricing > hardcoded
      const sourcePriority = { database: 0, pricing: 1, hardcoded: 2 };
      const aPriority = sourcePriority[a.source] || 3;
      const bPriority = sourcePriority[b.source] || 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Length (shorter first)
      return aCity.length - bCity.length;
    });
    
    // 6. Limit results
    const finalSuggestions = uniqueSuggestions.slice(0, parseInt(limit));
    
    console.log('✅ Returning location suggestions:', {
      query,
      total: finalSuggestions.length,
      sources: finalSuggestions.reduce((acc, s) => {
        acc[s.source] = (acc[s.source] || 0) + 1;
        return acc;
      }, {})
    });
    
    res.json(finalSuggestions);
    
  } catch (error) {
    console.error('❌ Location autocomplete error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch location suggestions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get popular locations (most used cities in marketplace)
app.get('/api/locations/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    console.log('📊 Fetching popular locations...');
    
    // Get most common cities from marketplace furniture
    const { data: popularCities, error } = await supabaseClient
      .from('marketplace_furniture')
      .select('city_name')
      .not('city_name', 'is', null)
      .limit(1000); // Get a good sample
    
    if (error) {
      console.error('❌ Error fetching popular cities:', error);
      // Return fallback popular Dutch cities
      const fallbackCities = [
        'Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Eindhoven',
        'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen'
      ];
      
      return res.json(fallbackCities.slice(0, parseInt(limit)).map(city => ({
        city_name: city,
        count: 0,
        coordinates: { lat: 52.1, lon: 5.1 }
      })));
    }
    
    // Count occurrences
    const cityCounts = {};
    popularCities.forEach(item => {
      const city = item.city_name;
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    
    // Sort by count and format response
    const sortedCities = Object.entries(cityCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, parseInt(limit))
      .map(([city, count]) => ({
        city_name: city,
        count,
        coordinates: { lat: 52.1, lon: 5.1 } // Generic Netherlands coordinates
      }));
    
    console.log('✅ Popular cities:', sortedCities.map(c => `${c.city_name} (${c.count})`));
    res.json(sortedCities);
    
  } catch (error) {
    console.error('❌ Popular locations error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch popular locations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all available cities (for dropdown/filter purposes)
app.get('/api/locations/cities', async (req, res) => {
  try {
    console.log('🏙️ Fetching all available cities...');
    
    // Get unique cities from multiple sources
    const sources = await Promise.allSettled([
      // Marketplace cities
      supabaseClient
        .from('marketplace_furniture')
        .select('city_name')
        .not('city_name', 'is', null),
      
      // Pricing cities
      supabaseClient
        .from('city_base_charges')
        .select('city_name')
        .not('city_name', 'is', null)
    ]);
    
    const allCities = new Set();
    
    // Process results from all sources
    sources.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.data) {
        result.value.data.forEach(item => {
          if (item.city_name) {
            allCities.add(item.city_name);
          }
        });
      } else {
        console.log(`⚠️ Source ${index} failed:`, result.reason?.message);
      }
    });
    
    // Add hardcoded cities as fallback
    const hardcodedCities = [
      'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven',
      'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen',
      'Haarlem', 'Arnhem', 'Enschede', 'Amersfoort', 'Apeldoorn',
      'Hoofddorp', 'Maastricht', 'Leiden', 'Dordrecht', 'Zoetermeer',
      'Zwolle', 'Deventer', 'Delft', 'Alkmaar', 'Leeuwarden'
    ];
    
    hardcodedCities.forEach(city => allCities.add(city));
    
    // Convert to sorted array
    const sortedCities = Array.from(allCities).sort();
    
    console.log('✅ Available cities:', sortedCities.length);
    res.json(sortedCities);
    
  } catch (error) {
    console.error('❌ All cities error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cities',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== END LOCATION AUTOCOMPLETE ====================

// Get all item moving requests
app.get('/api/item-moving-requests', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('item_moving')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item moving requests' });
  }
});

// Get all house moving requests
app.get('/api/house-moving-requests', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('house_moving')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch house moving requests' });
  }
});


// Get all constants in one request to avoid race conditions
app.get('/api/constants', async (req, res) => {
    try {
        console.log('📋 Fetching all constants...');
        
        // Fetch all four datasets in parallel
        const [furnitureResult, cityChargesResult, pricingConfigResult] = await Promise.all([
            supabaseClient.from('furniture_items').select('*'),
            supabaseClient.from('city_base_charges').select('*'),
            supabaseClient.from('pricing_config').select('*').eq('is_active', true).single()
        ]);

        // Handle furniture items
        if (furnitureResult.error) {
            console.error('❌ Error fetching furniture items:', furnitureResult.error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch furniture items',
                details: furnitureResult.error.message 
            });
        }

        // Handle city base charges
        if (cityChargesResult.error) {
            console.error('❌ Error fetching city base charges:', cityChargesResult.error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch city base charges',
                details: cityChargesResult.error.message 
            });
        }

        // Handle pricing config
        if (pricingConfigResult.error) {
            console.error('❌ Error fetching pricing config:', pricingConfigResult.error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch pricing config',
                details: pricingConfigResult.error.message 
            });
        }

        // Process furniture items - map to expected format
        const furnitureItems = (furnitureResult.data || []).map(({ name, category, points }) => ({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name,
            category,
            points
        }));

        // Group furniture items by category for itemCategories
        const categoryMap = {};
        for (const item of furnitureItems) {
            if (!categoryMap[item.category]) {
                categoryMap[item.category] = [];
            }
            categoryMap[item.category].push({ id: item.id, name: item.name });
        }
        const itemCategories = Object.entries(categoryMap).map(([name, items]) => ({ name, items }));

        // Process city base charges - map to expected format
        const cityBaseCharges = {};
        for (const row of cityChargesResult.data || []) {
            cityBaseCharges[row.city_name] = {
                normal: row.normal,
                cityDay: row.city_day,
                dayOfWeek: row.day_of_week || 1 // Default to 1 if not specified
            };
        }

        // Process pricing config - extract the config object
        const pricingConfig = pricingConfigResult.data?.config || {};

        const response = {
            success: true,
            data: {
                furnitureItems,
                itemCategories,
                cityBaseCharges,
                pricingConfig
            },
            meta: {
                furnitureItemsCount: furnitureItems.length,
                categoriesCount: itemCategories.length,
                citiesCount: Object.keys(cityBaseCharges).length,
                hasPricingConfig: !!pricingConfigResult.data,
                timestamp: new Date().toISOString()
            }
        };

        console.log('✅ Constants fetched successfully:', {
            furnitureItems: furnitureItems.length,
            categories: itemCategories.length,
            cities: Object.keys(cityBaseCharges).length,
            hasPricingConfig: !!pricingConfigResult.data
        });

        res.json(response);
    } catch (error) {
        console.error('❌ Error fetching constants:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== END CONSTANTS ENDPOINT ====================

// 8. Item Donation Endpoint with Photo Upload (shared special-requests bucket)
app.post('/api/item-donation-requests', (req, res, next) => {
    console.log('🎁 Item Donation Request - Before multer - Headers:', req.headers);
    console.log('🎁 Item Donation Request - Before multer - Content-Type:', req.get('Content-Type'));
    
    // Handle multer errors for photo uploads
    upload.array('photos', 10)(req, res, (err) => {
        console.log('🎁 Item Donation Request - After multer - Body:', req.body);
        console.log('🎁 Item Donation Request - After multer - Files:', req.files?.length || 0);
        
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
            console.error('🎁 Multer error:', err);
            return res.status(500).json({ error: 'Upload failed: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
  try {
    console.log('🎁 Item Donation Request - Headers:', req.headers);
    console.log('🎁 Item Donation Request - Content-Type:', req.get('Content-Type'));
    console.log('🎁 Item Donation Request - Full Body:', req.body);
    console.log('🎁 Item Donation Request - Files:', req.files?.length || 0);
    
    // Debug: Log all form fields
    console.log('🎁 Form fields received:');
    Object.keys(req.body).forEach(key => {
      console.log(`  ${key}:`, req.body[key]);
    });
    
    // Check if we have files (indicates multipart/form-data)
    const hasFiles = req.files && req.files.length > 0;
    const contentType = req.get('Content-Type') || '';
    const isMultipart = contentType.includes('multipart/form-data') || hasFiles;
    
    console.log('🎁 Is Multipart:', isMultipart, 'Has Files:', hasFiles);
    
    let body = req.body;
    let photoUrls = [];
    let donationItems, customItem, contactInfo, pickupLocation, donationLocation, pickupLocationCoords, donationLocationCoords, preferredPickupDate, isDateFlexible, donationType, specialInstructions, organizationName, organizationContact, totalEstimatedValue, itemCondition, floor, elevatorAvailable, preferredTimeSpan;

    if (isMultipart) {
      console.log('🎁 Processing as multipart/form-data');
      // Parse fields from req.body (all values are strings)
      try {
        donationItems = body.donationItems ? JSON.parse(body.donationItems) : [];
        customItem = body.customItem || null;
        
        // Handle contactInfo - try JSON first, then fallback to individual fields
        if (body.contactInfo) {
          try {
            contactInfo = JSON.parse(body.contactInfo);
          } catch (contactParseError) {
            console.log('🎁 ContactInfo JSON parse failed, using individual fields');
            contactInfo = {
              firstName: body.contactFirstName || '',
              lastName: body.contactLastName || '',
              email: body.contactEmail || '',
              phone: body.contactPhone || ''
            };
          }
        } else {
          // Use individual fields if contactInfo JSON is not provided
          contactInfo = {
            firstName: body.contactFirstName || '',
            lastName: body.contactLastName || '',
            email: body.contactEmail || '',
            phone: body.contactPhone || ''
          };
        }
        
        pickupLocation = body.pickupLocation || null;
        donationLocation = body.donationLocation || null;
        pickupLocationCoords = body.pickupLocationCoords ? JSON.parse(body.pickupLocationCoords) : null;
        donationLocationCoords = body.donationLocationCoords ? JSON.parse(body.donationLocationCoords) : null;
        preferredPickupDate = body.preferredPickupDate || null;
        isDateFlexible = body.isDateFlexible === 'true';
        donationType = body.donationType || 'charity';
        specialInstructions = body.specialInstructions || null;
        organizationName = body.organizationName || null;
        organizationContact = body.organizationContact ? JSON.parse(body.organizationContact) : null;
        totalEstimatedValue = body.totalEstimatedValue ? parseFloat(body.totalEstimatedValue) : null;
        itemCondition = body.itemCondition || null;
        floor = body.floor || null;
        elevatorAvailable = body.elevatorAvailable === 'true';
        preferredTimeSpan = body.preferredTimeSpan || null;
      } catch (parseError) {
        console.error('🎁 Error parsing FormData fields:', parseError);
        return res.status(400).json({ error: 'Invalid form data format' });
      }
    } else {
      console.log('🎁 Processing as JSON');
      // JSON body fallback (legacy)
      ({ donationItems, customItem, contactInfo, pickupLocation, donationLocation, pickupLocationCoords, donationLocationCoords, preferredPickupDate, isDateFlexible, donationType, specialInstructions, organizationName, organizationContact, totalEstimatedValue, itemCondition, floor, elevatorAvailable, preferredTimeSpan } = body);
    }

    // Validate required fields
    if (!contactInfo || !contactInfo.email || !contactInfo.firstName || !contactInfo.lastName) {
      return res.status(400).json({ error: 'Contact information is required' });
    }
    if (!donationItems || (Array.isArray(donationItems) && donationItems.length === 0)) {
      return res.status(400).json({ error: 'At least one donation item is required' });
    }

    // Process photo uploads if any
    console.log('🎁 Processing photos:', req.files ? req.files.length : 0, 'files');
    if (req.files && req.files.length > 0) {
      // Check if special-requests bucket exists
      const { data: bucketData, error: bucketError } = await supabaseClient.storage.getBucket('special-requests');
      if (bucketError) {
        console.error('🎁 Bucket error:', bucketError);
        return res.status(500).json({ error: 'Storage bucket not accessible', details: bucketError });
      }
      console.log('🎁 Bucket exists:', bucketData);
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        console.log(`🎁 Processing file ${i + 1}/${req.files.length}:`, file.originalname, file.size, 'bytes');
        
        try {
          // Check if the image format is supported
          const isSupported = imageProcessingService.isImageFormatSupported(file.originalname);
          console.log(`🎁 Format supported: ${isSupported} (${file.originalname})`);
          
          let finalBuffer = file.buffer;
          let finalFilename = file.originalname;
          let finalMimeType = file.mimetype;
          
          // Always process images for optimization and format conversion
          console.log(`🎁 Processing image: ${file.originalname} (Original size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)`);
          
          let conversionResult;
          
          // Convert unsupported formats (HEIC, etc.) or optimize all images
          if (!isSupported || file.originalname.toLowerCase().includes('.heic')) {
            console.log(`🎁 Converting unsupported format: ${file.originalname}`);
            
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
            console.log(`🎁 Optimizing supported image: ${file.originalname}`);
            
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
            console.log(`🎁 File still over 2MB (${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB), applying aggressive compression...`);
            
            let currentBuffer = finalBuffer;
            let quality = 70;
            let maxWidth = 1600;
            let maxHeight = 1200;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (currentBuffer.length > targetSizeInBytes && attempts < maxAttempts) {
              attempts++;
              console.log(`🎁 Compression attempt ${attempts}/${maxAttempts} - Quality: ${quality}, Max dimensions: ${maxWidth}x${maxHeight}`);
              
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
                console.log(`🎁 After compression attempt ${attempts}: ${(currentBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                
                // Reduce quality and dimensions for next attempt
                quality = Math.max(30, quality - 10);
                maxWidth = Math.max(800, maxWidth - 200);
                maxHeight = Math.max(600, maxHeight - 150);
                
              } catch (compressionError) {
                console.error(`🎁 Compression attempt ${attempts} failed:`, compressionError.message);
                break;
              }
            }
            
            // Update final values
            finalBuffer = currentBuffer;
            finalMimeType = 'image/jpeg';
            finalFilename = finalFilename.replace(/\.(png|webp|gif)$/i, '.jpg');
            
            if (finalBuffer.length > targetSizeInBytes) {
              console.log(`🎁 Warning: File still over 2MB after ${maxAttempts} attempts. Final size: ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            } else {
              console.log(`🎁 Successfully compressed to ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            }
          }
          
          // Calculate size reduction
          const sizeReduction = Math.round((1 - finalBuffer.length / file.buffer.length) * 100);
          console.log(`🎁 Size reduction: ${sizeReduction}% (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB → ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
          
          console.log(`🎁 Processing completed: ${file.originalname} -> ${finalFilename}`);

          // Upload the processed image
          console.log(`🎁 Uploading: ${finalFilename} (${finalBuffer.length} bytes)`);
          
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('special-requests')
            .upload(finalFilename, finalBuffer, {
              contentType: finalMimeType
            });

          if (uploadError) {
            console.error('🎁 Error uploading processed file:', uploadError);
            throw uploadError;
          }
          
          console.log('🎁 Upload successful:', uploadData);
          const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/special-requests/${finalFilename}`;
          console.log('🎁 Generated image URL:', imageUrl);
          photoUrls.push(imageUrl);
          
        } catch (photoError) {
          console.error(`🎁 Error processing file ${file.originalname}:`, photoError);
          // Continue with other photos even if one fails
        }
      }
      console.log('🎁 Final photoUrls array:', photoUrls);
    }

    // Prepare data for database insertion
    console.log('🎁 Preparing database insert with photoUrls:', photoUrls);
    const insertData = {
      donation_items: donationItems,
      custom_item: customItem || null,
      contact_info: contactInfo,
      pickup_location: pickupLocation || null,
      donation_location: donationLocation || null,
      pickup_location_coords: pickupLocationCoords || null,
      donation_location_coords: donationLocationCoords || null,
      preferred_pickup_date: preferredPickupDate || null,
      is_date_flexible: Boolean(isDateFlexible),
      donation_type: donationType || 'charity',
      special_instructions: specialInstructions || null,
      organization_name: organizationName || null,
      organization_contact: organizationContact || null,
      total_estimated_value: totalEstimatedValue ? parseFloat(totalEstimatedValue) : null,
      item_condition: itemCondition || null,
      photo_urls: photoUrls,
      floor: floor || null,
      elevator_available: elevatorAvailable || false,
      preferred_time_span: preferredTimeSpan || null,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    console.log('🎁 Insert data photo_urls field:', insertData.photo_urls);

    const { data, error } = await supabase
      .from('item_donations')
      .insert([insertData])
      .select();
    if (error) {
      return res.status(500).json({ error: 'Failed to save donation request.', details: error.message });
    }
    res.status(201).json({
      message: 'Item donation request saved successfully.',
      data: data[0],
      distanceCalculation: null
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// ====================================================
// MARKETPLACE ITEM DETAILS API ENDPOINTS
// ====================================================

// Get all marketplace item details
app.get('/api/marketplace-item-details', async (req, res) => {
  try {
    console.log('📋 Fetching marketplace item details...');
    
    const { data, error } = await supabaseClient
      .from('marketplace_item_details')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('subcategory', { ascending: true });

    if (error) {
      console.error('❌ Error fetching marketplace item details:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch marketplace item details',
        details: error.message 
      });
    }

    console.log('✅ Marketplace item details fetched successfully:', data.length, 'items');
    res.json({
      success: true,
      data: data || [],
      meta: {
        count: data?.length || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ Error in marketplace item details endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// Admin endpoints for managing marketplace item details
app.get('/api/admin/marketplace-item-details', authenticateAdmin, async (req, res) => {
  try {
    console.log('📋 Admin fetching marketplace item details...');
    
    const { data, error } = await supabaseClient
      .from('marketplace_item_details')
      .select('*')
      .order('category', { ascending: true })
      .order('subcategory', { ascending: true });

    if (error) {
      console.error('❌ Error fetching marketplace item details:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch marketplace item details',
        details: error.message 
      });
    }

    console.log('✅ Admin marketplace item details fetched successfully:', data.length, 'items');
    res.json({
      success: true,
      data: data || [],
      meta: {
        count: data?.length || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ Error in admin marketplace item details endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// Create new marketplace item detail
app.post('/api/admin/marketplace-item-details', authenticateAdmin, async (req, res) => {
  try {
    const { category, subcategory, points } = req.body;
    console.log('📋 Admin creating marketplace item detail:', { category, subcategory, points });
    
    if (!category || points === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Category and points are required' 
      });
    }

    const { data, error } = await supabaseClient
      .from('marketplace_item_details')
      .insert([{
        category,
        subcategory: subcategory || null,
        points: parseInt(points) || 1,
        is_active: true
      }])
      .select();

    if (error) {
      console.error('❌ Error creating marketplace item detail:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create marketplace item detail',
        details: error.message 
      });
    }

    console.log('✅ Marketplace item detail created successfully:', data[0]);
    res.status(201).json({
      success: true,
      data: data[0],
      message: 'Marketplace item detail created successfully'
    });
  } catch (err) {
    console.error('❌ Error in create marketplace item detail endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// Update marketplace item detail
app.put('/api/admin/marketplace-item-details/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, subcategory, points, is_active } = req.body;
    console.log('📋 Admin updating marketplace item detail:', { id, category, subcategory, points, is_active });
    
    const updateData = {};
    if (category !== undefined) updateData.category = category;
    if (subcategory !== undefined) updateData.subcategory = subcategory;
    if (points !== undefined) updateData.points = parseInt(points);
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabaseClient
      .from('marketplace_item_details')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('❌ Error updating marketplace item detail:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update marketplace item detail',
        details: error.message 
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Marketplace item detail not found' 
      });
    }

    console.log('✅ Marketplace item detail updated successfully:', data[0]);
    res.json({
      success: true,
      data: data[0],
      message: 'Marketplace item detail updated successfully'
    });
  } catch (err) {
    console.error('❌ Error in update marketplace item detail endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// Delete marketplace item detail (soft delete)
app.delete('/api/admin/marketplace-item-details/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📋 Admin deleting marketplace item detail:', id);
    
    // First check if the item exists
    const { data: existingItem, error: checkError } = await supabaseClient
      .from('marketplace_item_details')
      .select('*')
      .eq('id', id)
      .single();

    if (checkError || !existingItem) {
      console.log('❌ Marketplace item detail not found:', id);
      return res.status(404).json({ 
        success: false, 
        error: 'Marketplace item detail not found' 
      });
    }

    // Delete the item
    const { error: deleteError } = await supabaseClient
      .from('marketplace_item_details')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Error deleting marketplace item detail:', deleteError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete marketplace item detail',
        details: deleteError.message 
      });
    }

    res.json({
      success: true,
      data: existingItem,
      message: 'Marketplace item detail deleted successfully'
    });
  } catch (err) {
    console.error('❌ Error in delete marketplace item detail endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// Get dynamic pricing multipliers based on marketplace item details
app.get('/api/marketplace-pricing-multipliers', async (req, res) => {
  try {
    console.log('💰 Fetching marketplace pricing multipliers...');
    
    // Get all marketplace item details to calculate multipliers
    const { data: itemDetails, error: itemError } = await supabaseClient
      .from('marketplace_item_details')
      .select('*')
      .eq('is_active', true);

    if (itemError) {
      console.error('❌ Error fetching marketplace item details:', itemError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch marketplace item details',
        details: itemError.message 
      });
    }

    // Calculate dynamic multipliers based on points
    const maxPoints = Math.max(...itemDetails.map(item => item.points));
    const minPoints = Math.min(...itemDetails.map(item => item.points));
    const avgPoints = itemDetails.reduce((sum, item) => sum + item.points, 0) / itemDetails.length;

    // Define base costs and calculate multipliers
    const baseCarryingCost = 3; // Base carrying cost
    const baseAssemblyCost = 60; // Base assembly cost
    
    // Calculate multipliers based on points ranges
    const multipliers = {
      carrying: {
        lowPoints: {
          threshold: Math.floor(avgPoints), // Below average points
          multiplier: 1.0, // Base multiplier
          cost: baseCarryingCost
        },
        highPoints: {
          threshold: Math.ceil(avgPoints), // Above average points
          multiplier: Math.max(1.5, maxPoints / avgPoints), // Dynamic multiplier based on max points
          cost: Math.round(baseCarryingCost * Math.max(1.5, maxPoints / avgPoints))
        }
      },
      assembly: {
        lowPoints: {
          threshold: Math.floor(avgPoints), // Below average points
          multiplier: 1.0, // Base multiplier
          cost: baseAssemblyCost
        },
        highPoints: {
          threshold: Math.ceil(avgPoints), // Above average points
          multiplier: Math.max(1.5, maxPoints / avgPoints), // Dynamic multiplier based on max points
          cost: Math.round(baseAssemblyCost * Math.max(1.5, maxPoints / avgPoints))
        }
      },
      points: {
        min: minPoints,
        max: maxPoints,
        average: Math.round(avgPoints * 10) / 10,
        threshold: Math.ceil(avgPoints) // Threshold for high points category
      }
    };

    console.log('✅ Marketplace pricing multipliers calculated successfully');
    res.json({
      success: true,
      data: multipliers,
      meta: {
        itemCount: itemDetails.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ Error in marketplace pricing multipliers endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      details: err.message 
    });
  }
});

// ====================================================
// SALES HISTORY API ENDPOINTS
// ====================================================

// Store sales history after checkout completion
app.post('/api/sales-history', async (req, res) => {
  try {
    console.log('💰 Storing sales history:', req.body);
    
    const {
      orderId,
      customerEmail,
      customerName,
      customerPhone,
      itemName,
      itemCategory,
      itemSubcategory,
      itemPoints,
      itemPrice,
      quantity,
      totalAmount,
      paymentMethod,
      paymentStatus,
      orderStatus,
      pickupAddress,
      dropoffAddress,
      pickupDate,
      pickupTime,
      deliveryFee,
      assemblyFee,
      carryingFee,
      extraHelperFee,
      studentDiscount,
      subtotal,
      taxAmount,
      finalTotal,
      currency,
      notes
    } = req.body;

    // Validate required fields
    if (!orderId || !customerEmail || !itemName || !itemPrice || !finalTotal) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, customerEmail, itemName, itemPrice, finalTotal'
      });
    }

    const salesData = {
      order_id: orderId,
      customer_email: customerEmail,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      item_name: itemName,
      item_category: itemCategory || null,
      item_subcategory: itemSubcategory || null,
      item_points: parseInt(itemPoints) || 0,
      item_price: parseFloat(itemPrice),
      quantity: parseInt(quantity) || 1,
      total_amount: parseFloat(totalAmount),
      payment_method: paymentMethod || 'card',
      payment_status: paymentStatus || 'completed',
      order_status: orderStatus || 'completed',
      pickup_address: pickupAddress || null,
      dropoff_address: dropoffAddress || null,
      pickup_date: pickupDate || null,
      pickup_time: pickupTime || null,
      delivery_fee: parseFloat(deliveryFee) || 0,
      assembly_fee: parseFloat(assemblyFee) || 0,
      carrying_fee: parseFloat(carryingFee) || 0,
      extra_helper_fee: parseFloat(extraHelperFee) || 0,
      student_discount: parseFloat(studentDiscount) || 0,
      subtotal: parseFloat(subtotal),
      tax_amount: parseFloat(taxAmount) || 0,
      final_total: parseFloat(finalTotal),
      currency: currency || 'EUR',
      notes: notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💰 Inserting sales history data:', salesData);

    const { data, error } = await supabase
      .from('sales_history')
      .insert([salesData])
      .select();

    if (error) {
      console.error('❌ Error storing sales history:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to store sales history',
        details: error.message
      });
    }

    console.log('✅ Sales history stored successfully:', data[0]);
    res.status(201).json({
      success: true,
      data: data[0],
      message: 'Sales history stored successfully'
    });

  } catch (err) {
    console.error('❌ Error in sales history endpoint:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: err.message
    });
  }
});

// Get sales history (admin endpoint)
app.get('/api/admin/sales-history', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Admin fetching sales history...');
    
    const { page = 1, limit = 50, search, startDate, endDate, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = supabase
      .from('sales_history')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,item_name.ilike.%${search}%,order_id.ilike.%${search}%`);
    }
    
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    
    if (category) {
      query = query.eq('item_category', category);
    }

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('sales_history')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting sales history:', countError);
    }

    // Apply pagination
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching sales history:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sales history',
        details: error.message
      });
    }

    console.log('✅ Sales history fetched successfully:', data.length, 'records');
    res.json({
      success: true,
      data: data || [],
      meta: {
        count: data?.length || 0,
        total: count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((count || 0) / parseInt(limit)),
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('❌ Error in admin sales history endpoint:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: err.message
    });
  }
});

// Get sales statistics (admin endpoint)
app.get('/api/admin/sales-statistics', authenticateAdmin, async (req, res) => {
  try {
    console.log('📊 Admin fetching sales statistics...');
    
    const { startDate, endDate } = req.query;
    
    let query = supabase
      .from('sales_history')
      .select('*');

    // Apply date filters
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching sales statistics:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sales statistics',
        details: error.message
      });
    }

    // Calculate statistics
    const totalSales = data?.length || 0;
    const totalRevenue = data?.reduce((sum, sale) => sum + parseFloat(sale.final_total), 0) || 0;
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    
    // Group by category
    const categoryStats = {};
    data?.forEach(sale => {
      const category = sale.item_category || 'Uncategorized';
      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, revenue: 0 };
      }
      categoryStats[category].count++;
      categoryStats[category].revenue += parseFloat(sale.final_total);
    });

    // Group by date (last 30 days)
    const last30Days = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    data?.forEach(sale => {
      const saleDate = new Date(sale.created_at);
      if (saleDate >= thirtyDaysAgo) {
        const dateKey = saleDate.toISOString().split('T')[0];
        if (!last30Days[dateKey]) {
          last30Days[dateKey] = { count: 0, revenue: 0 };
        }
        last30Days[dateKey].count++;
        last30Days[dateKey].revenue += parseFloat(sale.final_total);
      }
    });

    const statistics = {
      totalSales,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      categoryStats,
      last30Days: Object.entries(last30Days).map(([date, stats]) => ({
        date,
        count: stats.count,
        revenue: Math.round(stats.revenue * 100) / 100
      })).sort((a, b) => a.date.localeCompare(b.date))
    };

    console.log('✅ Sales statistics calculated successfully');
    res.json({
      success: true,
      data: statistics,
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('❌ Error in admin sales statistics endpoint:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: err.message
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
    
    server.listen(port, async () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Server timeouts configured: keepAlive=5min, headers=5.17min, request=5min`);
        
        // Warm up cache on server start
        try {
            console.log('🔥 Warming up cache...');
            await warmUpCache();
            console.log('✅ Cache warmed up successfully');
        } catch (error) {
            console.error('❌ Failed to warm up cache:', error);
        }
    });
}