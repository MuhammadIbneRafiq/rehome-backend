import express from 'express';
import { supabaseClient } from '../db/params.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Get all projects for a user
router.get('/', authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .from('projects_with_chat_view')
            .select('*')
            .eq('user_id', req.user.id)
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

// Get a specific project
router.get('/:projectId', authenticateUser, async (req, res) => {
    const { projectId } = req.params;
    
    try {
        const { data, error } = await supabaseClient
            .from('projects_with_chat_view')
            .select('*')
            .eq('id', projectId)
            .eq('user_id', req.user.id)
            .single();

        if (error) {
            console.error('Error fetching project:', error);
            return res.status(500).json({ error: 'Failed to fetch project' });
        }

        if (!data) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a new project
router.post('/', authenticateUser, async (req, res) => {
    const { chatId, title, description } = req.body;
    
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .insert([{
                user_id: req.user.id,
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
router.put('/:projectId', authenticateUser, async (req, res) => {
    const { projectId } = req.params;
    const { status } = req.body;
    
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .update({ 
                status,
                ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {})
            })
            .eq('id', projectId)
            .eq('user_id', req.user.id)
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

// Delete a project
router.delete('/:projectId', authenticateUser, async (req, res) => {
    const { projectId } = req.params;
    
    try {
        const { error } = await supabaseClient
            .from('projects')
            .delete()
            .eq('id', projectId)
            .eq('user_id', req.user.id);

        if (error) {
            console.error('Error deleting project:', error);
            return res.status(500).json({ error: 'Failed to delete project' });
        }

        res.status(204).send();
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
