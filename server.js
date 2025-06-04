// server.js - ReHome Pricing System Backend
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";
import { supabaseClient } from "./db/params.js";
import { initializeDatabase } from "./db/init-database.js";

const app = express();
const port = process.env.PORT || 3000;

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Middleware
app.use(helmet());
app.use(cors({
    origin: "*", // Change to your frontend URL in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));

// Helper functions
const handleSupabaseError = (error) => {
    console.error('Supabase error:', error);
    return { error: 'Internal Server Error' };
};

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, error: "Authentication token is required" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Verify user exists in database
        const { data: user, error } = await supabaseClient
            .from('admin_users')
            .select('*')
            .eq('id', decoded.id)
            .eq('is_active', true)
            .single();

        if (error || !user) {
            return res.status(403).json({ success: false, error: "Invalid token or user not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Authentication Error:", error);
        return res.status(403).json({ success: false, error: "Invalid token" });
    }
};

// Audit logging middleware
const auditLog = async (req, res, next) => {
    if (req.user && req.method !== 'GET') {
        const originalSend = res.send;
        res.send = function(data) {
            // Log after successful operation
            if (res.statusCode < 400) {
                supabaseClient.from('audit_logs').insert({
                    admin_id: req.user.id,
                    action: `${req.method} ${req.path}`,
                    table_name: req.path.split('/')[2] || 'unknown',
                    record_id: req.params.id || 'new',
                    old_values: req.oldValues || null,
                    new_values: req.body || null
                }).then(() => {}).catch(console.error);
            }
            originalSend.call(this, data);
        };
    }
    next();
};

// Validation schemas
const furnitureItemSchema = Joi.object({
    name: Joi.string().required().max(255),
    category: Joi.string().required().max(100),
    points: Joi.number().positive().required()
});

const cityBaseChargeSchema = Joi.object({
    cityName: Joi.string().required().max(100),
    normal: Joi.number().positive().required(),
    cityDay: Joi.number().positive().required()
});

const cityDayDataSchema = Joi.object({
    cityName: Joi.string().required().max(100),
    days: Joi.array().items(Joi.string()).required()
});

const adminLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const pricingCalculationSchema = Joi.object({
    serviceType: Joi.string().valid('house-moving', 'item-transport').required(),
    pickupLocation: Joi.string().required(),
    dropoffLocation: Joi.string().required(),
    selectedDate: Joi.string().required(),
    isDateFlexible: Joi.boolean().required(),
    itemQuantities: Joi.object().required(),
    floorPickup: Joi.number().integer().min(0).required(),
    floorDropoff: Joi.number().integer().min(0).required(),
    elevatorPickup: Joi.boolean().required(),
    elevatorDropoff: Joi.boolean().required(),
    assemblyItems: Joi.object().required(),
    extraHelperItems: Joi.object().required(),
    isStudent: Joi.boolean().required(),
    hasStudentId: Joi.boolean().required(),
    isEarlyBooking: Joi.boolean().optional()
});

// Routes

// Health check
app.get("/", (req, res) => {
    res.json({ success: true, message: "ReHome Pricing System API running successfully 🚀" });
});

// Initialize database route (for development)
app.post("/api/init-database", async (req, res) => {
    try {
        await initializeDatabase();
        res.json({ success: true, message: "Database initialized successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== AUTHENTICATION ENDPOINTS ====================

// Admin login
app.post("/api/admin/login", async (req, res) => {
    try {
        const { error: validationError } = adminLoginSchema.validate(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError.details[0].message });
        }

        const { email, password } = req.body;

        const { data: user, error } = await supabaseClient
            .from('admin_users')
            .select('*')
            .eq('email', email)
            .eq('is_active', true)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, error: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, error: "Invalid credentials" });
        }

        const token = generateToken(user);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                },
                token,
                expiresAt
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Admin logout
app.post("/api/admin/logout", authenticateAdmin, (req, res) => {
    res.json({ success: true, message: "Logged out successfully" });
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

        const { cityName, normal, cityDay } = req.body;
        const insertData = { city_name: cityName, normal, city_day: cityDay };

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
        const { normal, cityDay } = req.body;
        const updateData = {};
        
        if (normal !== undefined) updateData.normal = normal;
        if (cityDay !== undefined) updateData.city_day = cityDay;

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

// Start server
app.listen(port, () => {
    console.log(`🚀 ReHome Pricing System API running on port ${port}`);
    console.log(`📋 API Documentation: http://localhost:${port}/`);
    console.log(`🔑 Admin login: admin@rehome.com / admin123`);
    
    // Initialize database on startup
    initializeDatabase().catch(console.error);
});

export default app;