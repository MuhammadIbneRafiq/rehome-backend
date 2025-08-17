-- ============================================
-- ReHome Projects Realtime Setup (Additional)
-- Run this in your Supabase SQL Editor AFTER chatbot_realtime_setup.sql
-- ============================================

-- 1. Create projects table (referenced in your backend code)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Create indexes for projects table
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_chat_id ON public.projects(chat_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at);

-- 3. Add foreign key constraint to link with chats
ALTER TABLE public.projects 
ADD CONSTRAINT fk_projects_chat_id 
FOREIGN KEY (chat_id) REFERENCES public.chats(chat_id) 
ON DELETE CASCADE;

-- 4. Create trigger for projects table
CREATE TRIGGER update_projects_updated_at 
    BEFORE UPDATE ON public.projects 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable Row Level Security for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for projects table
CREATE POLICY "Users can view their own projects" ON public.projects
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()::text
    );

CREATE POLICY "Users can create their own projects" ON public.projects
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()::text
    );

CREATE POLICY "Users can update their own projects" ON public.projects
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()::text
    );

CREATE POLICY "Users can delete their own projects" ON public.projects
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()::text
    );

-- 7. Enable realtime for projects table
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;

-- 8. Grant permissions
GRANT ALL ON public.projects TO authenticated;
GRANT SELECT ON public.projects TO anon;

-- 9. Create view for projects with chat info
CREATE OR REPLACE VIEW projects_with_chat_view AS
SELECT 
    p.*,
    c.title as chat_title,
    c.is_active as chat_active,
    c.created_at as chat_created_at
FROM public.projects p
JOIN public.chats c ON c.chat_id = p.chat_id
ORDER BY p.created_at DESC;

-- 10. Grant access to view
GRANT SELECT ON projects_with_chat_view TO authenticated;

-- 11. Add comment
COMMENT ON TABLE public.projects IS 'Projects created within chat sessions';

-- ============================================
-- Projects Setup Complete!
-- ============================================ 