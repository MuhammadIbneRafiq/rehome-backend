import { supabaseClient } from '../db/params.js';

const authenticateUser = async (req, res, next) => {
    console.log('=== AUTHENTICATION MIDDLEWARE ===');
    
    const authHeader = req.headers.authorization || "";
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    
    const token = authHeader.split(" ")[1]; // Assuming "Bearer TOKEN"

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: "Authentication token is required" });
    }

    console.log('Token received:', token.substring(0, 20) + '...');

    try {
        const { data: user, error } = await supabaseClient.auth.getUser(token);

        console.log('Supabase auth response - Error:', error);
        console.log('Supabase auth response - User:', user?.user?.email || 'No user');

        if (error) {
            console.log('❌ Supabase auth error:', error.message);
            return res.status(401).json({ 
                error: "Invalid or expired token", 
                details: error.message 
            });
        }

        if (!user || !user.user) {
            console.log('❌ No user found in token');
            return res.status(403).json({ error: "Invalid token or user not found" });
        }

        console.log('✅ Authentication successful for:', user.user.email);
        req.user = user.user;
        next();
    } catch (error) {
        console.error("❌ Authentication Error:", error);
        return res.status(403).json({ 
            error: "Authentication failed", 
            details: error.message 
        });
    }
};

export { authenticateUser }; 