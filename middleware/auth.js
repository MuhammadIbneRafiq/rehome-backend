import { supabaseClient } from '../db/params.js';

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

export { authenticateUser }; 