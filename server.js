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

const app = express();
const port = process.env.PORT || 3000;

// Environment variables with defaults
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Middleware
app.use(cors());
app.use(json()); // for parsing application/json

// Set up Multer for file uploads (in-memory storage for simplicity)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


import { createMollieClient } from '@mollie/api-client';


app.post("/mollie", async (req, res) => {
const amount = req.body.amount; // Get the amount from the request
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
  

app.post('/mollie-webhook', (req, res) => {
    const paymentId = req.body.id;
    // Verify and process the payment
    // Respond with a 200 status
    console.log('here it is', paymentId)
    res.sendStatus(200);
  });
  

const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1]; // Assuming "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: "Authentication token is required" });
    }

    try {
        const { data: user, error } = await supabaseClient.auth.getUser(token);

        if (error) {
            throw error;
        }

        if (!user || !user.user) { // Double check user exists
            return res.status(403).json({ error: "Invalid token or user not found" });
        }

        req.user = user.user;
        next();
    } catch (error) {
        console.error("Authentication Error:", error); // Log the error
        return res.status(403).json({ error: "Invalid token or user not found" });
    }
};

// --------------------  Application Routes --------------------

app.get("/", (req, res) => {
    res.send("ReHome B.V. running successfully... 🚀");
});

// --------------------  Authentication Routes --------------------
// Auth
app.post("/auth/signup", async (req, res) => {
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

app.post("/auth/login", async (req, res) => {
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
        if (error.message) {
            return res.status(500).json({ error: error.message });
        }
    }
});

app.post("/auth/logout", authenticateUser, async (req, res) => {
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
            .from('furniture')
            .select('*');

        console.log('Supabase response - Data:', data);
        console.log('Supabase response - Error:', error);

        if (error) {
            console.error("Supabase error details:", JSON.stringify(error, null, 2));
            return res.status(500).json({ 
                error: 'Supabase error',
                details: error.message || error
            });
        }

        console.log('Sending successful response with data:', data);
        res.json(data);
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

// item moving request.
// 9. Item Moving Request Endpoint
app.post('/api/item-moving-requests', async (req, res) => {
    try {
      const {
        email,
        pickupType,
        furnitureItems,
        customItem,
        floorPickup,
        floorDropoff,
        firstName,
        lastName,
        phone,
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
      console.log('the whole req.body', req.body)
    //   console.log(email, 'here is the email')

      const { data, error } = await supabase
        .from('item_moving')
        .insert([{
          email: contactInfo['email'],
          pickuptype: pickupType,
          furnitureitems: furnitureItems,
          customitem: customItem,
          floorpickup: parseInt(floorPickup, 10),
          floordropoff: parseInt(floorDropoff, 10),
          firstname: contactInfo['firstName'],
          lastname: contactInfo['lastName'],
          phone: contactInfo['phone'],
          estimatedprice: parseFloat(estimatedPrice),
          selecteddate: selectedDate,
          isdateflexible: isDateFlexible, // assuming this is a boolean from the client
          baseprice: parseFloat(basePrice),
          itempoints: parseInt(itemPoints, 10),
          carryingcost: parseFloat(carryingCost),
          disassemblycost: parseFloat(disassemblyCost),
          distancecost: parseFloat(distanceCost),
          extrahelpercost: parseFloat(extraHelperCost),
        //   isstudent: false,    // default value; adjust if needed
        //   studentidurl: null   // default value; adjust if needed
        }])
        .select();

        console.log('data to sb', data)
  
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
    console.log('the whole req.body', req.body)
    //   console.log(email, 'here is the email')

    const { data, error } = await supabase
        .from('house_moving')
        .insert([{
        email: contactInfo['email'],
        pickuptype: pickupType,
        furnitureitems: furnitureItems,
        customitem: customItem,
        floorpickup: parseInt(floorPickup, 10),
        floordropoff: parseInt(floorDropoff, 10),
        firstname: contactInfo['firstName'],
        lastname: contactInfo['lastName'],
        phone: contactInfo['phone'],
        estimatedprice: parseFloat(estimatedPrice),
        selecteddate: selectedDate,
        isdateflexible: isDateFlexible, // assuming this is a boolean from the client
        baseprice: parseFloat(basePrice),
        itempoints: parseInt(itemPoints, 10),
        carryingcost: parseFloat(carryingCost),
        disassemblycost: parseFloat(disassemblyCost),
        distancecost: parseFloat(distanceCost),
        extrahelpercost: parseFloat(extraHelperCost),
        //   isstudent: false,    // default value; adjust if needed
        //   studentidurl: null   // default value; adjust if needed
        }])
        .select();

        console.log('data to sb', data)

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
            .from('furniture')
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
    const { name, description, image_url, price } = req.body;

    if (!furnitureId) {
        return res.status(400).json({ error: 'Furniture ID is required.' });
    }

    try {
        const { data, error } = await supabase
            .from('furniture')
            .update({ name, description, image_url, price })
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
            .from('furniture')
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
      // Check if the bucket exists (but don't try to create it here!)
      const { data: bucketData, error: bucketError } = await supabaseClient.storage.getBucket('furniture-images');
      console.log('thi sis buckt data', bucketData)

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
          const imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/furniture-images/${fileName}`;
          console.log('this is img url', imageUrl)
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
    const { name, description, imageUrl, price, cityName } = req.body; // Changed image_url to imageUrl
    const sellerEmail = req.user.email; // Get seller's email from the authenticated user

    if (!name || !price || !imageUrl || !cityName) { // Modified check
        return res.status(400).json({ error: 'Name, price, city and image URL are required.' });
    }

    try {
        const { data, error } = await supabase
            .from('furniture')
            .insert([{ name, description, image_url: imageUrl, price, seller_email: sellerEmail, city_name: cityName, sold: false}])
            .select();
        console.log('this is NEW FUNR', data)
        if (error) {
            console.error('Error creating furniture:', error);
            return res.status(500).json(handleSupabaseError(error));
        }

        res.status(201).json(data[0]); // Return the newly created item
    } catch (err) {
        console.error('Error creating furniture:', err);
        res.status(500).json({ error: 'Internal Server Error' });
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
            .from('furniture')
            .select('*')
            .eq('id', furnitureId)
            .single(); // Expect only one result (or null)

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
        // 3. Delete from furniture table
        const { error: deleteError } = await supabase
            .from('furniture')
            .delete()
            .eq('id', furnitureId);

        if (deleteError) {
            console.error('Error deleting from furniture:', deleteError);
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

// Setup WebSocket connection for real-time messages
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Update with your frontend URL in production
        methods: ["GET", "POST"]
    }
});

// Setup Supabase realtime subscription for messages
const setupRealtimeMessaging = async () => {
    try {
        // Subscribe to all message insertions
        const channel = supabase
            .channel('public:marketplace_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'marketplace_messages'
            }, (payload) => {
                // Broadcast the new message to connected clients
                const message = payload.new;
                
                // Emit to specific item room
                io.to(`item_${message.item_id}`).emit('new_message', message);
                
                // Emit to specific user room
                io.to(`user_${message.receiver_id}`).emit('new_message', message);
            })
            .subscribe();
            
        console.log('Realtime messaging setup complete');
    } catch (error) {
        console.error('Error setting up realtime messaging:', error);
    }
};

setupRealtimeMessaging();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Join item-specific room
    socket.on('join_item', (itemId) => {
        socket.join(`item_${itemId}`);
    });
    
    // Join user-specific room
    socket.on('join_user', (userId) => {
        socket.join(`user_${userId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});





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

// Start the server
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});


export default app;