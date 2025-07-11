import { supabaseClient } from '../db/params.js';
import jwt from 'jsonwebtoken';

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
        // First, try to verify as custom JWT token
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
        
        try {
            const decoded = jwt.verify(token, jwtSecret);
            console.log('✅ Custom JWT token verified for:', decoded.email);
            
            // Get user from database using the decoded info
            const { data: dbUser, error: dbError } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', decoded.userId)
                .single();

            if (dbError || !dbUser) {
                console.log('❌ User not found in database:', decoded.userId);
                return res.status(403).json({ error: "User not found" });
            }

            req.user = {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name,
                provider: decoded.provider || 'custom'
            };
            
            console.log('✅ Custom authentication successful for:', req.user.email);
            return next();
            
        } catch (jwtError) {
            console.log('🔄 Custom JWT verification failed, trying Supabase:', jwtError.message);
            
            // Fall back to Supabase token verification
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

            console.log('✅ Supabase authentication successful for:', user.user.email);
            req.user = user.user;
            return next();
        }
        
    } catch (error) {
        console.error("❌ Authentication Error:", error);
        return res.status(403).json({ 
            error: "Authentication failed", 
            details: error.message 
        });
    }
};

export { authenticateUser }; 