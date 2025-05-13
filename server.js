// server.js
import express, { json } from "express";
import cors from "cors";
import multer from 'multer'; // Import multer for handling file uploads
import { v4 as uuidv4 } from 'uuid'; // Import uuid to generate unique file names
import { supabaseClient } from "./db/params.js"; // Import both clients
// import { sendEmail } from "./notif.js";
import { Resend } from 'resend';
import { Server } from 'socket.io';
import http from 'http';

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const port = process.env.PORT || 3000;

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
        const { data, error } = await supabase
            .from('furniture')
            .select('*')
            .order('created_at', { ascending: false }); // Order by creation date, newest first

        if (error) {
            return res.status(500).json(handleSupabaseError(error));
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching furniture:', err);
        res.status(500).json({ error: 'Internal Server Error' });
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

// Start the server
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});