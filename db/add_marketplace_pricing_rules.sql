-- Migration: Add marketplace-specific pricing rules to pricing_config table
-- Run this SQL script in your Supabase SQL editor

-- ====================================================
-- STEP 1: UPDATE PRICING_CONFIG WITH MARKETPLACE RULES
-- ====================================================

-- Update the existing pricing_config to include marketplace-specific rules
UPDATE pricing_config 
SET config = config || '{
  "marketplacePricing": {
    "assemblyMultipliers": {
      "lowPoints": {
        "threshold": 6,
        "multiplier": 1.5
      },
      "highPoints": {
        "multiplier": 3.0
      }
    },
    "carryingMultipliers": {
      "lowPoints": {
        "threshold": 6,
        "multiplier": 0.012
      },
      "highPoints": {
        "multiplier": 0.030
      }
    },
    "baseMultipliers": {
      "itemTransportMultiplier": 1.2,
      "addonMultiplier": 2.5
    },
    "minimumCharge": 45.0,
    "earlyBookingDiscount": 0.05
  }
}'::jsonb
WHERE is_active = true;

-- ====================================================
-- STEP 2: VERIFY THE UPDATE
-- ====================================================

-- Check that the marketplace pricing rules were added successfully
SELECT 
  id,
  config->'marketplacePricing' as marketplace_pricing,
  is_active,
  updated_at
FROM pricing_config 
WHERE is_active = true;

-- ====================================================
-- STEP 3: CREATE HELPER FUNCTION FOR MARKETPLACE POINTS
-- ====================================================

-- Create a function to get points for a marketplace item
CREATE OR REPLACE FUNCTION get_marketplace_item_points(
  p_category VARCHAR(100),
  p_subcategory VARCHAR(100) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  item_points INTEGER;
BEGIN
  SELECT points INTO item_points
  FROM marketplace_item_details
  WHERE category = p_category 
    AND (subcategory = p_subcategory OR (p_subcategory IS NULL AND subcategory IS NULL))
    AND is_active = TRUE
  LIMIT 1;
  
  RETURN COALESCE(item_points, 3); -- Default to 3 points if not found
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- STEP 4: CREATE VIEW FOR MARKETPLACE PRICING CALCULATIONS
-- ====================================================

CREATE OR REPLACE VIEW marketplace_pricing_view AS
SELECT 
  mid.id,
  mid.category,
  mid.subcategory,
  mid.points,
  pc.config->'marketplacePricing'->'assemblyMultipliers'->'lowPoints'->>'multiplier' as assembly_low_multiplier,
  pc.config->'marketplacePricing'->'assemblyMultipliers'->'highPoints'->>'multiplier' as assembly_high_multiplier,
  pc.config->'marketplacePricing'->'carryingMultipliers'->'lowPoints'->>'multiplier' as carrying_low_multiplier,
  pc.config->'marketplacePricing'->'carryingMultipliers'->'highPoints'->>'multiplier' as carrying_high_multiplier,
  pc.config->'marketplacePricing'->'baseMultipliers'->>'itemTransportMultiplier' as item_transport_multiplier,
  pc.config->'marketplacePricing'->'baseMultipliers'->>'addonMultiplier' as addon_multiplier,
  pc.config->'marketplacePricing'->>'minimumCharge' as minimum_charge,
  pc.config->'marketplacePricing'->>'earlyBookingDiscount' as early_booking_discount,
  CASE 
    WHEN mid.points < 6 THEN 'low'
    ELSE 'high'
  END as points_category
FROM marketplace_item_details mid
CROSS JOIN pricing_config pc
WHERE mid.is_active = TRUE AND pc.is_active = TRUE;

-- ====================================================
-- MIGRATION COMPLETE
-- ====================================================
-- The marketplace pricing rules are now added to the pricing_config table
-- These rules include:
-- 1. Assembly multipliers for items below 6 points (1.5x) and above 6 points (3.0x)
-- 2. Carrying multipliers for items below 6 points (0.012x) and above 6 points (0.030x)
-- 3. Base multipliers for item transport (1.2x) and addon services (2.5x)
-- 4. Minimum charge of €45.0 for marketplace items
-- 5. Early booking discount of 5% for marketplace items
-- 
-- The helper function and view are created for easy access to these rules
-- The ReHomeCheckoutModal can now use these rules for pricing calculations 