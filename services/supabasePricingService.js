import NodeCache from 'node-cache';
import { supabaseClient } from '../db/params.js';
import {
  getCityScheduleStatusCached,
  getCityDaysInRangeCached,
  isDateBlockedCached
} from './cacheService.js';
import { calculateDistanceFromLocations } from './googleMapsService.js';
import {
  calculateHouseMovingFixedPrice,
  calculateItemTransportSameDatePrice,
  calculateItemTransportDiffDatesPrice,
  calculateFlexiblePrice,
  calculateRehomePrice
} from './pricing/basePriceCalculator.js';
import { findClosestCity as findClosestCityShared } from './pricing/cityUtils.js';

// Use shared Supabase client
const supabase = supabaseClient;

// Cache for pricing configuration (5 minutes TTL)
const pricingCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Supabase-based pricing service for backend calculations
 */
class SupabasePricingService {
  invalidateCache() {
    pricingCache.flushAll();
  }

  /**
   * Get all pricing configuration from Supabase with caching
   */
  async getPricingConfig() {
    const cacheKey = 'pricing_config_all';
    const cached = pricingCache.get(cacheKey);
    if (cached) return cached;

    try {
      const [
        distancePricing,
        carryingConfig,
        assemblyPricing,
        discountsFees,
        extraHelper,
        cityCharges,
        furnitureItems
      ] = await Promise.all([
        supabase.from('distance_pricing_config').select('*'),
        supabase.from('carrying_config').select('*'),
        supabase.from('assembly_pricing_config').select('*'),
        supabase.from('discounts_fees_config').select('*'),
        supabase.from('extra_helper_config').select('*'),
        supabase.from('city_base_charges').select('*'),
        supabase.from('furniture_items').select('*')
      ]);

      const config = {
        distancePricing: distancePricing.data,
        carryingConfig: carryingConfig.data,
        assemblyPricing: assemblyPricing.data,
        discountsFees: discountsFees.data,
        extraHelper: extraHelper.data,
        cityCharges: cityCharges.data,
        furnitureItems: furnitureItems.data
      };

      pricingCache.set(cacheKey, config);
      return config;
    } catch (error) {
      console.error('Error fetching pricing config from Supabase:', error);
      throw error;
    }
  }

  /**
   * Calculate pricing based on input parameters
   */
  async calculatePricing(input) {
    console.log('[PRICING] Input:', JSON.stringify({
      serviceType: input.serviceType,
      isDateFlexible: input.isDateFlexible,
      selectedDate: input.selectedDate,
      selectedDateRange: input.selectedDateRange,
      pickupDate: input.pickupDate,
      dropoffDate: input.dropoffDate,
      pickupLocation: input.pickupLocation?.city || input.pickupLocation?.displayName,
      dropoffLocation: input.dropoffLocation?.city || input.dropoffLocation?.displayName,
      items: input.items?.length || 0,
      itemQuantities: input.itemQuantities
    }, null, 2));
    
    // Convert itemQuantities object to items array if items is not provided
    if ((!input.items || input.items.length === 0) && input.itemQuantities) {
      console.log('[PRICING] Converting itemQuantities to items array');
      input.items = Object.entries(input.itemQuantities)
        .filter(([_, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({
          id: itemId,
          quantity: quantity
        }));
      console.log('[PRICING] Converted items:', JSON.stringify(input.items, null, 2));
    }
    
    const config = await this.getPricingConfig();
    
    const breakdown = {
      basePrice: 0,
      itemValue: 0,
      distanceCost: 0,
      carryingCost: 0,
      assemblyCost: 0,
      extraHelperCost: 0,
      subtotal: 0,
      studentDiscount: 0,
      total: 0,
      breakdown: {
        baseCharge: {},
        items: {},
        distance: {},
        carrying: {},
        assembly: {},
        extraHelper: {}
      }
    };

    // 1. Calculate base charge
    const baseCharge = await this.calculateBaseCharge(input, config);
    console.log('[PRICING] Base Charge Result:', {
      finalPrice: baseCharge.finalPrice,
      city: baseCharge.city,
      isCityDay: baseCharge.isCityDay
    });
    breakdown.basePrice = baseCharge.finalPrice;
    breakdown.breakdown.baseCharge = baseCharge;

    // 2. Calculate item value
    const itemValue = this.calculateItemValue(input, config);
    console.log('[PRICING] Item Value Result:', {
      totalPoints: itemValue.totalPoints,
      multiplier: itemValue.multiplier,
      cost: itemValue.cost
    });
    breakdown.itemValue = itemValue.cost;
    breakdown.breakdown.items = itemValue;

    // 3. Calculate distance cost
    const distanceCost = await this.calculateDistanceCost(input, config);
    console.log('[PRICING] Distance Cost Result:', {
      distanceKm: distanceCost.distanceKm,
      cost: distanceCost.cost,
      freeThreshold: distanceCost.freeThreshold
    });
    breakdown.distanceCost = distanceCost.cost;
    breakdown.breakdown.distance = distanceCost;

    // 4. Calculate carrying cost
    const carryingCost = this.calculateCarryingCost(input, config);
    breakdown.carryingCost = carryingCost.totalCost;
    breakdown.breakdown.carrying = carryingCost;

    // 5. Calculate assembly cost
    const assemblyCost = this.calculateAssemblyCost(input, config);
    breakdown.assemblyCost = assemblyCost.totalCost;
    breakdown.breakdown.assembly = assemblyCost;

    // 6. Calculate extra helper cost
    const extraHelperCost = this.calculateExtraHelperCost(input, config);
    breakdown.extraHelperCost = extraHelperCost.cost;
    breakdown.breakdown.extraHelper = extraHelperCost;

    // 7. Calculate totals and discounts
    breakdown.subtotal = 
      breakdown.basePrice + 
      breakdown.itemValue + 
      breakdown.distanceCost + 
      breakdown.carryingCost + 
      breakdown.assemblyCost + 
      breakdown.extraHelperCost;

    // Apply student discount if applicable
    if (input.hasStudentId) {
      const studentDiscountConfig = config.discountsFees.find(d => d.type === 'student_discount');
      if (studentDiscountConfig) {
        breakdown.studentDiscount = breakdown.subtotal * studentDiscountConfig.percentage;
      }
    }

    breakdown.total = breakdown.subtotal - breakdown.studentDiscount;
    
    console.log('[PRICING] Final Breakdown:', {
      basePrice: breakdown.basePrice,
      itemValue: breakdown.itemValue,
      distanceCost: breakdown.distanceCost,
      carryingCost: breakdown.carryingCost,
      assemblyCost: breakdown.assemblyCost,
      extraHelperCost: breakdown.extraHelperCost,
      subtotal: breakdown.subtotal,
      studentDiscount: breakdown.studentDiscount,
      total: breakdown.total
    });

    return breakdown;
  }

  /**
   * Calculate base charge based on location and date
   */
  async calculateBaseCharge(input, config) {
    const { pickupLocation, dropoffLocation } = input;
    const selectedDate = input.selectedDate || input.selectedDateRange?.start;

    console.log('[DEBUG] calculateBaseCharge - Full Input:', {
      serviceType: input.serviceType,
      isDateFlexible: input.isDateFlexible,
      selectedDate,
      selectedDateRange: input.selectedDateRange,
      pickupDate: input.pickupDate,
      dropoffDate: input.dropoffDate,
      pickupLocation: pickupLocation?.displayName || pickupLocation?.text || 'unknown',
      dropoffLocation: dropoffLocation?.displayName || dropoffLocation?.text || 'unknown'
    });

    const pickupCityRow = this.findClosestCity(pickupLocation, config.cityCharges);
    const dropoffCityRow = this.findClosestCity(dropoffLocation, config.cityCharges);

    const pickupCity = pickupCityRow?.city_name || null;
    const dropoffCity = dropoffCityRow?.city_name || null;

    console.log('[DEBUG] calculateBaseCharge - Matched cities:', {
      pickupCity,
      dropoffCity
    });

    // Fallback: if no match, use the first configured city so pricing never returns 0 silently
    if (!pickupCityRow || !dropoffCityRow) {
      const fallback = config.cityCharges?.[0];
      console.warn('[WARN] calculateBaseCharge - City match failed. Using fallback base charge.', {
        pickupText: pickupLocation?.displayName || pickupLocation?.text || pickupLocation?.formattedAddress,
        dropoffText: dropoffLocation?.displayName || dropoffLocation?.text || dropoffLocation?.formattedAddress,
        fallbackCity: fallback?.city_name,
      });

      if (fallback) {
        return {
          city: fallback.city_name || null,
          isCityDay: false,
          originalPrice: fallback.normal || 0,
          finalPrice: fallback.normal || 0,
          type: 'Fallback Standard Rate'
        };
      }

      return {
        city: null,
        isCityDay: false,
        originalPrice: 0,
        finalPrice: 0,
        type: 'Location not supported'
      };
    }

    const getRates = (row) => ({
      normal: row?.normal ?? 0,
      cityDay: row?.city_day ?? 0
    });

    const pickupRates = getRates(pickupCityRow);
    const dropoffRates = getRates(dropoffCityRow);

    const isItemTransport = input.serviceType === 'item-transport' || input.serviceType === 'item_transport';
    const isHouseMoving = input.serviceType === 'house-moving' || input.serviceType === 'house_moving';
    const isIntercity = pickupCity !== dropoffCity;

    const rateParams = {
      isIntercity,
      pickupCheap: pickupRates.cityDay,
      pickupStandard: pickupRates.normal,
      dropoffCheap: dropoffRates.cityDay,
      dropoffStandard: dropoffRates.normal
    };

    let result; // { price, type }

    // Use dateOption to determine pricing path (fallback to legacy isDateFlexible)
    const effectiveDateOption = input.dateOption || (input.isDateFlexible ? 'rehome' : 'fixed');

    if (effectiveDateOption === 'rehome') {
      // ReHome can suggest option - always cheapest
      result = calculateRehomePrice({ pickupCheap: pickupRates.cityDay });
    } else if (effectiveDateOption === 'flexible' && input.selectedDateRange?.start && input.selectedDateRange?.end) {
      // Flexible date range
      const startDate = new Date(input.selectedDateRange.start);
      const endDate = new Date(input.selectedDateRange.end);
      const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Check if cities are included in calendar within range
      const cityDays = rangeDays <= 7 ? await getCityDaysInRangeCached(
        pickupCity, input.selectedDateRange.start, input.selectedDateRange.end
      ) : [];
      const pickupAvailable = (cityDays || []).length > 0;

      let bothSameDate = false;
      if (isIntercity && rangeDays <= 7 && pickupAvailable) {
        const dropoffCityDays = await getCityDaysInRangeCached(
          dropoffCity, input.selectedDateRange.start, input.selectedDateRange.end
        );
        // Check if both cities share at least one SAME scheduled date
        const pickupDateSet = new Set((cityDays || []).map(d => d.date || d));
        bothSameDate = (dropoffCityDays || []).some(d => pickupDateSet.has(d.date || d));
      }

      result = calculateFlexiblePrice({
        ...rateParams,
        rangeDays,
        pickupAvailableInRange: pickupAvailable,
        dropoffAvailableInRange: (isIntercity ? bothSameDate : pickupAvailable),
        bothAvailableSameDate: bothSameDate
      });
    } else {
      if (isItemTransport && input.pickupDate && input.dropoffDate) {
        const [pickupBlocked, dropoffBlocked] = await Promise.all([
          isDateBlockedCached(input.pickupDate, pickupCity),
          isDateBlockedCached(input.dropoffDate, dropoffCity)
        ]);
        if (pickupBlocked) {
          throw new Error('Pickup date is blocked and unavailable for booking');
        }
        if (dropoffBlocked) {
          throw new Error('Dropoff date is blocked and unavailable for booking');
        }

        const isSameDate = input.pickupDate === input.dropoffDate;
        const [pickupStatus, dropoffStatus] = await Promise.all([
          getCityScheduleStatusCached(pickupCity, input.pickupDate),
          getCityScheduleStatusCached(isIntercity ? dropoffCity : pickupCity, input.dropoffDate)
        ]);

        if (isSameDate) {
          result = calculateItemTransportSameDatePrice({
            ...rateParams,
            pickupScheduled: !!pickupStatus?.isScheduled,
            dropoffScheduled: !!dropoffStatus?.isScheduled,
            isEmpty: !!pickupStatus?.isEmpty,
            isBlocked: false
          });
        } else {
          result = calculateItemTransportDiffDatesPrice({
            ...rateParams,
            pickupScheduledOnPickupDate: !!pickupStatus?.isScheduled,
            dropoffScheduledOnDropoffDate: !!dropoffStatus?.isScheduled,
            pickupDateEmpty: !!pickupStatus?.isEmpty,
            dropoffDateEmpty: !!dropoffStatus?.isEmpty
          });
        }
      } else if (isHouseMoving && selectedDate) {
        const [pickupBlocked, dropoffBlocked] = await Promise.all([
          isDateBlockedCached(selectedDate, pickupCity),
          isDateBlockedCached(selectedDate, dropoffCity)
        ]);
        if (pickupBlocked || dropoffBlocked) {
          throw new Error('Selected date is blocked and unavailable for booking');
        }

        const [pickupStatus, dropoffStatus] = await Promise.all([
          getCityScheduleStatusCached(pickupCity, selectedDate),
          getCityScheduleStatusCached(dropoffCity, selectedDate)
        ]);

        result = calculateHouseMovingFixedPrice({
          ...rateParams,
          pickupScheduled: !!pickupStatus?.isScheduled,
          dropoffScheduled: !!dropoffStatus?.isScheduled,
          isEmpty: !!pickupStatus?.isEmpty && !!dropoffStatus?.isEmpty,
          isBlocked: false
        });
      } else {
        result = { price: pickupRates.normal, type: 'Standard Rate' };
      }
    }

    const finalCharge = result.price;
    const chargeType = result.type;
    const isCheapRate = chargeType.toLowerCase().includes('cheap') || chargeType.toLowerCase().includes('scheduled') || chargeType.toLowerCase().includes('city day') || chargeType.toLowerCase().includes('rehome');

    return {
      city: pickupCity,
      isCityDay: isCheapRate,
      originalPrice: finalCharge,
      finalPrice: finalCharge,
      type: chargeType
    };
  }

  /**
   * Calculate item value based on points
   */
  calculateItemValue(input, config) {
    const { items } = input;
    console.log('[DEBUG] calculateItemValue - items:', JSON.stringify(items));
    console.log('[DEBUG] calculateItemValue - config.furnitureItems count:', config.furnitureItems?.length);
    
    if (!items || items.length === 0) {
      console.log('[DEBUG] calculateItemValue - No items, returning 0');
      return { totalPoints: 0, multiplier: 1, cost: 0 };
    }

    let totalPoints = 0;
    items.forEach(item => {
      // First try exact ID match
      let furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      
      // If not found by ID and item has points, use the points directly
      if (!furnitureItem && item.points !== undefined) {
        console.log('[DEBUG] calculateItemValue - Using item points directly for:', item.id, 'points:', item.points);
        const itemPoints = parseFloat(item.points);
        totalPoints += itemPoints;
        console.log('[DEBUG] calculateItemValue - adding points:', itemPoints, 'total now:', totalPoints);
      } else if (furnitureItem) {
        console.log('[DEBUG] calculateItemValue - Found furniture item:', item.id, 'points:', furnitureItem.points);
        const itemPoints = parseFloat(furnitureItem.points) * item.quantity;
        totalPoints += itemPoints;
        console.log('[DEBUG] calculateItemValue - adding points:', itemPoints, 'total now:', totalPoints);
      } else {
        console.log('[WARN] calculateItemValue - Item not found and no points provided:', item.id, item.name);
      }
    });

    // Apply multiplier based on service type
    const multiplier = input.serviceType === 'house_moving' || input.serviceType === 'house-moving' ? 2.0 : 1.0;
    const finalCost = totalPoints * multiplier;
    
    console.log('[DEBUG] calculateItemValue - FINAL:', {
      totalPoints,
      multiplier,
      cost: finalCost
    });
    
    return {
      totalPoints,
      multiplier,
      cost: finalCost
    };
  }

  /**
   * Calculate distance cost
   */
  async calculateDistanceCost(input, config) {
    const { pickupLocation, dropoffLocation } = input;
    
    // Calculate distance using Google Maps API
    const distance = await this.calculateDistance(pickupLocation, dropoffLocation);
    
    // Determine distance category and rate
    let category = 'long';
    let rate = 0.5;
    
    const smallConfig = config.distancePricing.find(d => d.distance_type === 'small');
    const mediumConfig = config.distancePricing.find(d => d.distance_type === 'medium');
    const longConfig = config.distancePricing.find(d => d.distance_type === 'long');
    
    if (distance <= smallConfig?.threshold_km) {
      category = 'small';
      rate = smallConfig.rate_per_km;
    } else if (distance <= mediumConfig?.threshold_km) {
      category = 'medium';
      rate = mediumConfig.rate_per_km;
    } else {
      category = 'long';
      rate = longConfig?.rate_per_km || 0.5;
    }

    return {
      distanceKm: distance,
      category,
      rate,
      cost: distance * rate
    };
  }

  /**
   * Calculate carrying cost using new model: 1.35 per floor standard, 0.5 for boxes
   */
  calculateCarryingCost(input, config) {
    // Support both frontend naming (floorPickup/floorDropoff) and backend naming (pickupFloors/dropoffFloors)
    const pickupFloors = parseInt(input.pickupFloors || input.floorPickup || 0);
    const dropoffFloors = parseInt(input.dropoffFloors || input.floorDropoff || 0);
    const hasElevatorPickup = input.hasElevatorPickup || input.elevatorPickup || false;
    const hasElevatorDropoff = input.hasElevatorDropoff || input.elevatorDropoff || false;
    
    // If no floors, no carrying cost
    if (!pickupFloors && !dropoffFloors) {
      return { floors: 0, itemBreakdown: [], totalCost: 0 };
    }
    
    // Convert carrying items from frontend object format to array format
    // Frontend sends: { itemId: true, ... } or carryingServiceItems/carryingUpItems/carryingDownItems
    let items = input.items || [];
    
    // If items is empty, try to build from carryingServiceItems or itemQuantities
    if (!items.length) {
      const carryingItems = input.carryingServiceItems || {};
      const carryingUpItems = input.carryingUpItems || {};
      const carryingDownItems = input.carryingDownItems || {};
      const itemQuantities = input.itemQuantities || {};
      
      // Merge all carrying item selections
      const allCarryingItemIds = new Set([
        ...Object.keys(carryingItems).filter(id => carryingItems[id]),
        ...Object.keys(carryingUpItems).filter(id => carryingUpItems[id]),
        ...Object.keys(carryingDownItems).filter(id => carryingDownItems[id])
      ]);
      
      // Convert to array format with quantities
      items = Array.from(allCarryingItemIds).map(id => ({
        id,
        quantity: itemQuantities[id] || 1
      }));
    }
    
    // If no items but we have floors, use all items from input for carrying calculation
    if (!items.length && input.items && input.items.length > 0) {
      items = input.items;
    }
    
    if (!items.length) {
      return { floors: 0, itemBreakdown: [], totalCost: 0 };
    }

    const carryingConfigByType = new Map(
      (config.carryingConfig || []).map(c => [c.item_type, c])
    );

    const standardConfig = carryingConfigByType.get('standard');

    const BASE_FEE =
      standardConfig?.base_fee ??
      (config.carryingConfig || []).find(c => c.base_fee !== null && c.base_fee !== undefined)?.base_fee ??
      25;

    const BASE_FEE_THRESHOLD = standardConfig?.base_fee_threshold_points;
    
    const itemBreakdown = [];
    let totalCost = 0;
    let totalPoints = 0;
    
    // Calculate floors - elevators now use actual floor numbers (no more floor 1 rule)
    const rawPickupFloors = pickupFloors || 0;
    const rawDropoffFloors = dropoffFloors || 0;

    const totalFloors = rawPickupFloors + rawDropoffFloors;
    
    if (totalFloors === 0) {
      return { floors: 0, itemBreakdown: [], totalCost: 0 };
    }
    
    // First pass: count total boxes for exponential multiplier logic
    let totalBoxQuantity = 0;
    items.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (furnitureItem) {
        const itemNameLower = furnitureItem.name?.toLowerCase() || '';
        if (itemNameLower.includes('box')) {
          totalBoxQuantity += item.quantity;
        }
      }
    });
    
    // Get box config for threshold and high count multiplier
    const boxConfig = carryingConfigByType.get('box');
    const BOX_COUNT_THRESHOLD = boxConfig?.box_count_threshold ?? 10;
    const BOX_MULTIPLIER_HIGH = boxConfig?.multiplier_high_count ?? 1.5;
    const ELEVATOR_MULTIPLIER = boxConfig?.elevator_multiplier ?? 1.1;
    
    // Calculate cost per item
    let carryingItemPoints = 0; // Points from items selected for carrying only
    items.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (!furnitureItem) return;
      
      const points = furnitureItem.points * item.quantity;
      totalPoints += points;
      carryingItemPoints += points; // Track carrying items separately
      
      const itemNameLower = furnitureItem.name?.toLowerCase() || '';

      let itemType = 'standard';
      let multiplier = 1.35; // Default standard multiplier
      
      if (itemNameLower.includes('box')) {
        itemType = 'box';
        // Box carrying exponential logic (from DB config):
        // ≤ threshold: use standard multiplier
        // > threshold: use high count multiplier (accounts for tiring factor)
        // With elevator: use elevator multiplier (regardless of box count) atleast 1 has to have elevator
        if (hasElevatorPickup || hasElevatorDropoff) {
          multiplier = ELEVATOR_MULTIPLIER;
        } else if (totalBoxQuantity > BOX_COUNT_THRESHOLD) {
          multiplier = BOX_MULTIPLIER_HIGH;
        } else {
          const itemConfig = carryingConfigByType.get('box');
          multiplier = itemConfig?.multiplier_per_floor ?? 1.35;
        }
      } else if (itemNameLower.includes('bag')) {
        itemType = 'bag';
        const itemConfig = carryingConfigByType.get('bag');
        multiplier = itemConfig?.multiplier_per_floor ?? 1.35;
        // Apply elevator multiplier if both locations have elevators
        if (hasElevatorPickup && hasElevatorDropoff) {
          multiplier = itemConfig?.elevator_multiplier ?? ELEVATOR_MULTIPLIER;
        }
      } else if (itemNameLower.includes('luggage')) {
        itemType = 'luggage';
        const itemConfig = carryingConfigByType.get('luggage');
        multiplier = itemConfig?.multiplier_per_floor ?? 1.35;
        // Apply elevator multiplier if both locations have elevators
        if (hasElevatorPickup && hasElevatorDropoff) {
          multiplier = itemConfig?.elevator_multiplier ?? ELEVATOR_MULTIPLIER;
        }
      } else {
        // Standard items - use config
        const itemConfig = carryingConfigByType.get('standard');
        multiplier = itemConfig?.multiplier_per_floor ?? 1.35;
        // Apply elevator multiplier if both locations have elevators
        if (hasElevatorPickup && hasElevatorDropoff) {
          multiplier = itemConfig?.elevator_multiplier ?? ELEVATOR_MULTIPLIER;
        }
      }
      
      const cost = points * multiplier * totalFloors;
      totalCost += cost;
      
      itemBreakdown.push({
        name: furnitureItem.name,
        quantity: item.quantity,
        points,
        floors: totalFloors,
        multiplier,
        cost,
        ...(itemType === 'box' && { totalBoxes: totalBoxQuantity, threshold: BOX_COUNT_THRESHOLD })
      });
    });
    
    // Base fee applies based on carrying item points only (not all items)
    // If customer has many items but only needs help carrying one small item, base fee applies
    const shouldApplyBaseFee =
      totalCost > 0 &&
      (BASE_FEE_THRESHOLD === null || BASE_FEE_THRESHOLD === undefined || carryingItemPoints < BASE_FEE_THRESHOLD);

    if (shouldApplyBaseFee) {
      totalCost += BASE_FEE;
    }
    
    return {
      floors: totalFloors,
      itemBreakdown,
      totalCost,
      carryingItemPoints, // Include for debugging
      baseFeeApplied: shouldApplyBaseFee
    };
  }

  /**
   * Calculate assembly cost using standardized values
   */
  calculateAssemblyCost(input, config) {
    const { assemblyItems = {}, disassemblyItems = {}, itemQuantities = {}, isMarketplace } = input;
    
    console.log('[ASSEMBLY DEBUG] Input:', {
      assemblyItems,
      disassemblyItems,
      itemQuantities
    });
    
    const itemBreakdown = [];
    let totalCost = 0;
    
    // Process disassembly items first
    const disassemblyItemIds = Object.keys(disassemblyItems).filter(id => disassemblyItems[id]);
    console.log('[ASSEMBLY DEBUG] Disassembly item IDs:', disassemblyItemIds);
    
    disassemblyItemIds.forEach(itemId => {
      const furnitureItem = config.furnitureItems.find(f => f.id === itemId);
      if (!furnitureItem) {
        console.log('[ASSEMBLY DEBUG] Furniture item not found for ID:', itemId);
        return;
      }
      
      const quantity = itemQuantities[itemId] || 1;
      
      // Determine item category
      let category = null;
      const itemName = furnitureItem.name.toLowerCase();
      
      if (itemName.includes('bed')) category = 'bed';
      else if (itemName.includes('wardrobe') || itemName.includes('closet')) category = 'closet';
      else if (itemName.includes('table') || itemName.includes('desk')) category = 'table';
      else if (itemName.includes('sofa')) category = 'sofa';
      
      if (!category) return;
      
      // Find pricing for this category (case-insensitive)
      const assemblyPrice = config.assemblyPricing.find(a => 
        a.item_category === category && 
        a.item_type.toLowerCase() === itemName
      );
      
      if (!assemblyPrice) {
        console.log('[ASSEMBLY DEBUG] No disassembly price found for item:', itemName);
        return;
      }
      
      const price = isMarketplace && assemblyPrice.marketplace_price ? 
        assemblyPrice.marketplace_price : assemblyPrice.price;
      
      const cost = price * quantity;
      totalCost += cost;
      
      itemBreakdown.push({
        name: furnitureItem.name,
        quantity: quantity,
        pricePerItem: price,
        cost,
        type: 'disassembly'
      });
      
      console.log('[ASSEMBLY DEBUG] Added disassembly cost:', cost, 'for', furnitureItem.name);
    });
    
    // Process assembly items separately
    const assemblyItemIds = Object.keys(assemblyItems).filter(id => assemblyItems[id]);
    console.log('[ASSEMBLY DEBUG] Assembly item IDs:', assemblyItemIds);
    
    assemblyItemIds.forEach(itemId => {
      const furnitureItem = config.furnitureItems.find(f => f.id === itemId);
      if (!furnitureItem) {
        console.log('[ASSEMBLY DEBUG] Furniture item not found for ID:', itemId);
        return;
      }
      
      const quantity = itemQuantities[itemId] || 1;
      
      // Determine item category
      let category = null;
      const itemName = furnitureItem.name.toLowerCase();
      
      console.log('[ASSEMBLY DEBUG] Processing item:', furnitureItem.name, 'Category check...');
      
      if (itemName.includes('bed')) category = 'bed';
      else if (itemName.includes('wardrobe') || itemName.includes('closet')) category = 'closet';
      else if (itemName.includes('table') || itemName.includes('desk')) category = 'table';
      else if (itemName.includes('sofa')) category = 'sofa';
      
      console.log('[ASSEMBLY DEBUG] Determined category:', category, 'for item:', itemName);
      
      if (!category) {
        console.log('[ASSEMBLY DEBUG] No category found for item:', itemName);
        return;
      }
      
      // Find pricing for this category (case-insensitive)
      const assemblyPrice = config.assemblyPricing.find(a => 
        a.item_category === category && 
        a.item_type.toLowerCase() === itemName
      );
      
      console.log('[ASSEMBLY DEBUG] Looking for pricing with category:', category, 'and item type:', itemName);
      console.log('[ASSEMBLY DEBUG] Found assembly price:', assemblyPrice);
      
      if (!assemblyPrice) {
        console.log('[ASSEMBLY DEBUG] No assembly price found for item:', itemName);
        return;
      }
      
      const price = isMarketplace && assemblyPrice.marketplace_price ? 
        assemblyPrice.marketplace_price : assemblyPrice.price;
      
      const cost = price * quantity;
      totalCost += cost;
      
      itemBreakdown.push({
        name: furnitureItem.name,
        quantity: quantity,
        pricePerItem: price,
        cost,
        type: 'assembly'
      });
      
      console.log('[ASSEMBLY DEBUG] Added assembly cost:', cost, 'for', furnitureItem.name);
    });
    
    console.log('[ASSEMBLY DEBUG] Final total cost:', totalCost);
    console.log('[ASSEMBLY DEBUG] Final item breakdown:', itemBreakdown);
    
    return {
      itemBreakdown,
      totalCost
    };
  }

  /**
   * Calculate extra helper cost
   */
  calculateExtraHelperCost(input, config) {
    const { items, needsExtraHelper, extraHelperItems, itemQuantities } = input;
    
    // Check if extra helper is needed (either boolean or object with selected items)
    const hasExtraHelper = needsExtraHelper || (extraHelperItems && Object.keys(extraHelperItems).some(id => extraHelperItems[id]));
    
    if (!hasExtraHelper) {
      return { totalPoints: 0, category: 'none', cost: 0 };
    }
    
    let totalPoints = 0;
    
    // If extraHelperItems is provided, calculate points for selected items only
    if (extraHelperItems && Object.keys(extraHelperItems).length > 0) {
      Object.keys(extraHelperItems).forEach(itemId => {
        if (extraHelperItems[itemId]) {
          const furnitureItem = config.furnitureItems.find(f => f.id === itemId);
          if (furnitureItem) {
            const quantity = itemQuantities?.[itemId] || 1;
            totalPoints += furnitureItem.points * quantity;
          }
        }
      });
    } else {
      // Fallback to old behavior if only needsExtraHelper boolean is provided
      items?.forEach(item => {
        const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
        if (furnitureItem) {
          totalPoints += furnitureItem.points * item.quantity;
        }
      });
    }
    
    console.log('[EXTRA HELPER DEBUG] Total points for extra helper:', totalPoints);
    
    // Find appropriate helper config
    const smallHelper = config.extraHelper.find(h => h.item_threshold <= 30);
    const bigHelper = config.extraHelper.find(h => h.item_threshold > 30);
    
    let cost = 0;
    let category = 'none';
    
    if (totalPoints <= 30) {
      cost = smallHelper?.price;
      category = 'small';
    } else {
      cost = bigHelper?.price;
      category = 'big';
    }
    
    console.log('[EXTRA HELPER DEBUG] Category:', category, 'Cost:', cost);
    
    return {
      totalPoints,
      category,
      cost
    };
  }

  /**
   * Helper: Find closest city from Google Place object.
   * Delegates to the shared findClosestCity in cityUtils.js (single source of truth).
   */
  findClosestCity(placeObject, cityCharges) {
    return findClosestCityShared(placeObject, cityCharges);
  }

  /**
   * Helper: Check if date is a city day
   */
  async isCityDay(city, date) {
    if (!date) return false;
    
    // Check if the date falls on the city's designated day
    const dayOfWeek = new Date(date).getDay();
    return dayOfWeek === city.day_of_week;
  }

  /**
   * Calculate distance between pickup and dropoff locations
   * Uses the centralized googleMapsService with caching
   */
  async calculateDistance(pickup, dropoff) {
    return await calculateDistanceFromLocations(pickup, dropoff);
  }

}

export default new SupabasePricingService();
