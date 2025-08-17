-- Migration script to preserve existing data when changing item_id from integer to UUID
-- This is more complex and requires careful handling

-- Step 1: Create a temporary mapping table
CREATE TEMP TABLE item_id_mapping AS
SELECT DISTINCT item_id as old_id, gen_random_uuid() as new_id
FROM marketplace_messages;

-- Step 2: Add a new column for UUID
ALTER TABLE marketplace_messages ADD COLUMN item_id_uuid UUID;

-- Step 3: Update the new column with mapped UUIDs
UPDATE marketplace_messages 
SET item_id_uuid = mapping.new_id
FROM item_id_mapping mapping
WHERE marketplace_messages.item_id = mapping.old_id;

-- Step 4: Drop the old column and rename the new one
ALTER TABLE marketplace_messages DROP COLUMN item_id;
ALTER TABLE marketplace_messages RENAME COLUMN item_id_uuid TO item_id;

-- Step 5: Add NOT NULL constraint
ALTER TABLE marketplace_messages ALTER COLUMN item_id SET NOT NULL;

-- Step 6: Recreate indexes and constraints
CREATE INDEX idx_marketplace_messages_item_id ON marketplace_messages(item_id);

-- Note: You'll need to update your marketplace_furniture table to use these new UUIDs
-- or create a proper mapping between the old integer IDs and the furniture table 