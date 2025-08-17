-- Fix marketplace_messages table schema
-- Change item_id from integer to UUID to match marketplace_furniture.id

-- First, drop the foreign key constraint if it exists
ALTER TABLE public.marketplace_messages 
DROP CONSTRAINT IF EXISTS fk_marketplace_messages_item_id;

-- Drop existing data (if you want to keep existing data, you'll need a more complex migration)
-- WARNING: This will delete all existing messages!
TRUNCATE TABLE public.marketplace_messages;

-- Change the column type from integer to UUID
ALTER TABLE public.marketplace_messages 
ALTER COLUMN item_id TYPE UUID USING item_id::text::UUID;

-- Add the foreign key constraint back
ALTER TABLE public.marketplace_messages 
ADD CONSTRAINT fk_marketplace_messages_item_id 
FOREIGN KEY (item_id) REFERENCES public.marketplace_furniture(id) ON DELETE CASCADE;

-- Recreate indexes if needed
DROP INDEX IF EXISTS idx_marketplace_messages_item_id;
CREATE INDEX idx_marketplace_messages_item_id ON public.marketplace_messages(item_id); 