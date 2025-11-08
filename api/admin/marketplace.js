import express from 'express';
import { supabaseClient } from '../../db/params.js';
import { authenticateUser } from '../../middleware/auth.js';

const router = express.Router();

// List of admin email addresses
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

        // ONLY check if email is in admin list - nothing else
        if (!ADMIN_EMAILS.includes(user.user.email)) {
            return res.status(403).json({ success: false, error: `Access denied. Email ${user.user.email} is not in admin list` });
        }

        req.user = user.user;
        next();
    } catch (error) {
        console.error("Admin authentication error:", error);
        return res.status(403).json({ success: false, error: "Authentication failed" });
    }
};

// Get all marketplace furniture with pagination, filtering, and sorting
router.get('/furniture', authenticateAdmin, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            search = '', 
            status = 'all', 
            type = 'all',
            category = 'all',
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        let query = supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact' });

        // Apply search filter
        if (search && search.trim()) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,seller_email.ilike.%${search}%,city_name.ilike.%${search}%`);
        }

        // Apply status filter
        if (status !== 'all') {
            if (status === 'available') {
                query = query.or('status.eq.available,status.is.null').eq('sold', false);
            } else if (status === 'reserved') {
                query = query.eq('status', 'reserved');
            } else if (status === 'sold') {
                query = query.or('status.eq.sold,sold.eq.true');
            }
        }

        // Apply type filter
        if (type !== 'all') {
            if (type === 'rehome') {
                query = query.eq('is_rehome', true);
            } else if (type === 'user') {
                query = query.eq('is_rehome', false);
            }
        }

        // Apply category filter
        if (category !== 'all') {
            query = query.eq('category', category);
        }

        // Apply sorting
        const validSortFields = ['created_at', 'updated_at', 'name', 'price', 'views_count'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder === 'asc' ? { ascending: true } : { ascending: false };
        
        query = query.order(sortField, order);

        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        // Map database field names to frontend expected field names
        const mappedData = (data || []).map(item => ({
            ...item,
            isrehome: item.is_rehome,
            image_url: item.image_urls || item.image_url
        }));

        res.json({
            success: true,
            data: mappedData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching marketplace furniture:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch marketplace furniture' });
    }
});

// Get single furniture item
router.get('/furniture/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseClient
            .from('marketplace_furniture')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ success: false, error: 'Furniture item not found' });
        }

        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome,
            image_url: data.image_urls || data.image_url
        };

        res.json({ success: true, data: mappedData });
    } catch (error) {
        console.error('Error fetching furniture item:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch furniture item' });
    }
});

// Create new furniture item
router.post('/furniture', authenticateAdmin, async (req, res) => {
    try {
        const adminEmail = req.user.email;
        const furnitureData = {
            ...req.body,
            seller_email: req.body.seller_email || adminEmail,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_rehome: req.body.isrehome || false,
            image_urls: req.body.image_url || req.body.image_urls
        };

        const { data, error } = await supabaseClient
            .from('marketplace_furniture')
            .insert(furnitureData)
            .select()
            .single();

        if (error) throw error;

        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome,
            image_url: data.image_urls || data.image_url
        };

        res.status(201).json({ 
            success: true, 
            data: mappedData, 
            message: 'Furniture item created successfully' 
        });
    } catch (error) {
        console.error('Error creating furniture item:', error);
        res.status(500).json({ success: false, error: 'Failed to create furniture item' });
    }
});

// Update furniture item
router.put('/furniture/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {
            ...req.body,
            updated_at: new Date().toISOString(),
            is_rehome: req.body.isrehome !== undefined ? req.body.isrehome : req.body.is_rehome,
            image_urls: req.body.image_url || req.body.image_urls
        };

        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.created_at;
        delete updates.isrehome; // Use is_rehome instead
        delete updates.image_url; // Use image_urls instead

        const { data, error } = await supabaseClient
            .from('marketplace_furniture')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ success: false, error: 'Furniture item not found' });
        }

        // Map database field names to frontend expected field names
        const mappedData = {
            ...data,
            isrehome: data.is_rehome,
            image_url: data.image_urls || data.image_url
        };

        res.json({ 
            success: true, 
            data: mappedData, 
            message: 'Furniture item updated successfully' 
        });
    } catch (error) {
        console.error('Error updating furniture item:', error);
        res.status(500).json({ success: false, error: 'Failed to update furniture item' });
    }
});

// Delete furniture item
router.delete('/furniture/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseClient
            .from('marketplace_furniture')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Furniture item deleted successfully' });
    } catch (error) {
        console.error('Error deleting furniture item:', error);
        res.status(500).json({ success: false, error: 'Failed to delete furniture item' });
    }
});

// Bulk operations
router.post('/furniture/bulk-action', authenticateAdmin, async (req, res) => {
    try {
        const { action, ids, updates } = req.body;

        if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Action and item IDs are required' 
            });
        }

        let result;
        let message;

        switch (action) {
            case 'delete':
                const { error: deleteError } = await supabaseClient
                    .from('marketplace_furniture')
                    .delete()
                    .in('id', ids);

                if (deleteError) throw deleteError;
                message = `${ids.length} items deleted successfully`;
                break;

            case 'update_status':
                if (!updates || !updates.status) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Status is required for status update' 
                    });
                }

                const { data: updateData, error: updateError } = await supabaseClient
                    .from('marketplace_furniture')
                    .update({ 
                        status: updates.status,
                        sold: updates.status === 'sold',
                        updated_at: new Date().toISOString()
                    })
                    .in('id', ids)
                    .select();

                if (updateError) throw updateError;
                result = updateData;
                message = `${ids.length} items status updated to ${updates.status}`;
                break;

            case 'update_category':
                if (!updates || !updates.category) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Category is required for category update' 
                    });
                }

                const { data: categoryData, error: categoryError } = await supabaseClient
                    .from('marketplace_furniture')
                    .update({ 
                        category: updates.category,
                        updated_at: new Date().toISOString()
                    })
                    .in('id', ids)
                    .select();

                if (categoryError) throw categoryError;
                result = categoryData;
                message = `${ids.length} items category updated to ${updates.category}`;
                break;

            default:
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid action. Supported actions: delete, update_status, update_category' 
                });
        }

        res.json({ 
            success: true, 
            message,
            data: result 
        });
    } catch (error) {
        console.error('Error performing bulk action:', error);
        res.status(500).json({ success: false, error: 'Failed to perform bulk action' });
    }
});

// Get marketplace statistics
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        // Get total counts
        const { count: totalCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true });

        const { count: availableCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .or('status.eq.available,status.is.null')
            .eq('sold', false);

        const { count: soldCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .or('status.eq.sold,sold.eq.true');

        const { count: reservedCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'reserved');

        const { count: rehomeCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .eq('is_rehome', true);

        // Get category distribution
        const { data: categoryData } = await supabaseClient
            .from('marketplace_furniture')
            .select('category')
            .not('category', 'is', null);

        const categoryStats = categoryData?.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
        }, {}) || {};

        // Get recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { count: recentCount } = await supabaseClient
            .from('marketplace_furniture')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo.toISOString());

        const stats = {
            total: totalCount || 0,
            available: availableCount || 0,
            sold: soldCount || 0,
            reserved: reservedCount || 0,
            rehome_items: rehomeCount || 0,
            user_items: (totalCount || 0) - (rehomeCount || 0),
            recent_listings: recentCount || 0,
            categories: categoryStats
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching marketplace stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch marketplace statistics' });
    }
});

export default router;