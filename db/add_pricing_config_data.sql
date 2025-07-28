-- Migration: Add pricing configuration data to database
-- Run this SQL script in your Supabase SQL editor

-- ====================================================
-- STEP 1: ADD PRICING CONFIGURATION DATA TO PRICING_CONFIG TABLE
-- ====================================================

-- First, let's update the existing pricing_config table to include all the configuration data
-- We'll replace the existing config with a comprehensive one that includes all the pricing parameters

UPDATE pricing_config 
SET config = '{
  "baseMultipliers": {
    "houseMovingItemMultiplier": 2.0,
    "itemTransportMultiplier": 1.0,
    "addonMultiplier": 3.0
  },
  "distancePricing": {
    "smallDistance": { "threshold": 10, "rate": 0 },
    "mediumDistance": { "threshold": 50, "rate": 0.7 },
    "longDistance": { "rate": 0.5 }
  },
  "carryingMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 0.015 },
    "highValue": { "multiplier": 0.040 }
  },
  "assemblyMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 1.80 },
    "highValue": { "multiplier": 4.2 }
  },
  "extraHelperPricing": {
    "smallMove": { "threshold": 30, "price": 30 },
    "bigMove": { "price": 60 }
  },
  "cityRange": {
    "baseRadius": 8,
    "extraKmRate": 3
  },
  "studentDiscount": 0.1,
  "weekendMultiplier": 1.2,
  "cityDayMultiplier": 1.3,
  "floorChargePerLevel": 25.0,
  "elevatorDiscount": 0.8,
  "assemblyChargePerItem": 30.0,
  "extraHelperChargePerItem": 20.0,
  "earlyBookingDiscount": 0.1,
  "minimumCharge": 75.0
}'
WHERE is_active = true;

-- If no active config exists, create one
INSERT INTO pricing_config (config, is_active)
SELECT '{
  "baseMultipliers": {
    "houseMovingItemMultiplier": 2.0,
    "itemTransportMultiplier": 1.0,
    "addonMultiplier": 3.0
  },
  "distancePricing": {
    "smallDistance": { "threshold": 10, "rate": 0 },
    "mediumDistance": { "threshold": 50, "rate": 0.7 },
    "longDistance": { "rate": 0.5 }
  },
  "carryingMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 0.015 },
    "highValue": { "multiplier": 0.040 }
  },
  "assemblyMultipliers": {
    "lowValue": { "threshold": 6, "multiplier": 1.80 },
    "highValue": { "multiplier": 4.2 }
  },
  "extraHelperPricing": {
    "smallMove": { "threshold": 30, "price": 30 },
    "bigMove": { "price": 60 }
  },
  "cityRange": {
    "baseRadius": 8,
    "extraKmRate": 3
  },
  "studentDiscount": 0.1,
  "weekendMultiplier": 1.2,
  "cityDayMultiplier": 1.3,
  "floorChargePerLevel": 25.0,
  "elevatorDiscount": 0.8,
  "assemblyChargePerItem": 30.0,
  "extraHelperChargePerItem": 20.0,
  "earlyBookingDiscount": 0.1,
  "minimumCharge": 75.0
}', true
WHERE NOT EXISTS (SELECT 1 FROM pricing_config WHERE is_active = true);

-- ====================================================
-- STEP 2: VERIFY THE UPDATE
-- ====================================================

-- Check that the pricing config was updated successfully
SELECT 
  id,
  config,
  is_active,
  created_at,
  updated_at
FROM pricing_config 
WHERE is_active = true;

-- ====================================================
-- STEP 3: CREATE INDEX FOR BETTER PERFORMANCE
-- ====================================================

-- Ensure we have proper indexing for the pricing_config table
CREATE INDEX IF NOT EXISTS idx_pricing_config_active ON pricing_config(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pricing_config_updated_at ON pricing_config(updated_at);

-- ====================================================
-- MIGRATION COMPLETE
-- ====================================================
-- The pricing configuration is now stored in the database and can be fetched via API
-- The frontend constants.ts file should be updated to fetch this data from the API 