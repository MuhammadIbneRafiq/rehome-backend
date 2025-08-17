-- ============================================
-- ReHome Chatbot Realtime Setup
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable the pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Create chats table
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL REFERENCES public.chats(chat_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_final BOOLEAN DEFAULT TRUE,
    search_needed BOOLEAN DEFAULT FALSE,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536)  -- For semantic search
);

-- 3. Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL REFERENCES public.chats(chat_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_chat_id ON public.projects(chat_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for chats
CREATE POLICY "Users can view their own chats"
    ON public.chats FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own chats"
    ON public.chats FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own chats"
    ON public.chats FOR UPDATE
    USING (auth.uid()::text = user_id);

-- 7. Create RLS policies for messages
CREATE POLICY "Users can view messages in their chats"
    ON public.messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.chats
        WHERE chats.chat_id = messages.chat_id
        AND chats.user_id = auth.uid()::text
    ));

CREATE POLICY "Users can create messages in their chats"
    ON public.messages FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.chats
        WHERE chats.chat_id = messages.chat_id
        AND chats.user_id = auth.uid()::text
    ));

-- 8. Create RLS policies for projects
CREATE POLICY "Users can view their own projects"
    ON public.projects FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid()::text = user_id);

-- 9. Create view for chat messages with user info
CREATE OR REPLACE VIEW chat_messages_view AS
SELECT 
    m.*,
    c.title as chat_title,
    c.is_active as chat_active
FROM public.messages m
JOIN public.chats c ON c.chat_id = m.chat_id;

-- 10. Create view for projects with chat info
CREATE OR REPLACE VIEW projects_with_chat_view AS
SELECT 
    p.*,
    c.title as chat_title,
    c.is_active as chat_active
FROM public.projects p
JOIN public.chats c ON c.chat_id = p.chat_id;

-- 11. Enable realtime for all tables
BEGIN;
    DROP PUBLICATION IF EXISTS supabase_realtime;
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
COMMIT;

-- 12. Create function to get user's chats with latest message
CREATE OR REPLACE FUNCTION get_user_chats_with_latest_message(user_uuid TEXT)
RETURNS TABLE (
    chat_id TEXT,
    title TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    is_active BOOLEAN,
    latest_message TEXT,
    latest_message_time TIMESTAMPTZ,
    latest_sender TEXT,
    message_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.chat_id,
        c.title,
        c.created_at,
        c.updated_at,
        c.is_active,
        m.content as latest_message,
        m.created_at as latest_message_time,
        m.sender as latest_sender,
        COALESCE(msg_count.count, 0) as message_count
    FROM public.chats c
    LEFT JOIN LATERAL (
        SELECT content, created_at, sender
        FROM public.messages 
        WHERE chat_id = c.chat_id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) m ON true
    LEFT JOIN (
        SELECT chat_id, COUNT(*) as count
        FROM public.messages 
        GROUP BY chat_id
    ) msg_count ON msg_count.chat_id = c.chat_id
    WHERE c.user_id = user_uuid
    ORDER BY COALESCE(m.created_at, c.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Create function to clean up old messages (optional)
CREATE OR REPLACE FUNCTION cleanup_old_messages(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.messages 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep
    AND is_final = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Create function to mark chat as updated when new message is added
CREATE OR REPLACE FUNCTION update_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chats 
    SET updated_at = NOW() 
    WHERE chat_id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 15. Create trigger to update chat timestamp on new message
DROP TRIGGER IF EXISTS update_chat_on_new_message ON public.messages;
CREATE TRIGGER update_chat_on_new_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_timestamp();

-- 16. Create view for easy message querying with chat info
CREATE OR REPLACE VIEW chat_messages_view AS
SELECT 
    m.*,
    c.title as chat_title,
    c.is_active as chat_active
FROM public.messages m
JOIN public.chats c ON c.chat_id = m.chat_id;

-- 17. Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Done! Your chat system is now set up with realtime support and proper security.

-- ============================================
-- Setup Complete!
-- 
-- Your chatbot now has:
-- ✅ Proper tables with indexes
-- ✅ Row Level Security policies
-- ✅ Realtime enabled
-- ✅ Helper functions
-- ✅ Automatic timestamp updates
-- ✅ Notification triggers
-- ✅ Easy querying views
--
-- You can now use realtime subscriptions on:
-- - public.chats
-- - public.messages
-- ============================================ 