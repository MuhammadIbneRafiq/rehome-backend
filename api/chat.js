import express from 'express';
import { supabaseClient } from '../db/params.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all chats for a user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .rpc('get_user_chats_with_latest_message', { user_uuid: req.user.id });

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
router.get('/:chatId/messages', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .eq('user_id', req.user.id)
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
router.post('/', authenticateToken, async (req, res) => {
    const { title } = req.body;
    
    try {
        // Generate a unique chat_id
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const { data, error } = await supabaseClient
            .from('chats')
            .insert([{
                chat_id: chatId,
                user_id: req.user.id,
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
router.post('/:chatId/messages', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { content, sender = 'user' } = req.body;
    
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .insert([{
                chat_id: chatId,
                user_id: req.user.id,
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

// Update chat status
router.put('/:chatId', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { is_active } = req.body;
    
    try {
        const { data, error } = await supabaseClient
            .from('chats')
            .update({ is_active })
            .eq('chat_id', chatId)
            .eq('user_id', req.user.id)
            .select();

        if (error) {
            console.error('Error updating chat:', error);
            return res.status(500).json({ error: 'Failed to update chat' });
        }

        res.json(data ? data[0] : null);
    } catch (err) {
        console.error('Error updating chat:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router; 