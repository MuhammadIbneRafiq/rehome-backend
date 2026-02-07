import NodeCache from 'node-cache';
import { supabaseClient } from '../db/params.js';
import {
  getCityScheduleStatusCached,
  getCityDaysInRangeCached,
  isDateBlockedCached
} from './cacheService.js';
import { calculateDistanceFromLocations } from './googleMapsService.js';

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
    console.log('\n========== PRICING CALCULATION START ==========');
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
    console.log('here is the whole fucking config', config);
    
    const breakdown = {
      basePrice: 0,
      itemValue: 0,
      distanceCost: 0,
      carryingCost: 0,
      assemblyCost: 0,
      extraHelperCost: 0,
      subtotal: 0,
      studentDiscount: 0,
      lateBookingFee: 0,
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

    // Apply late booking fee if applicable
    if (input.daysUntilMove && input.daysUntilMove <= 3) {
      const lateFeeConfig = config.discountsFees.find(d => 
        d.type === (input.daysUntilMove <= 1 ? 'urgent_booking_fee' : 'late_booking_fee')
      );
      if (lateFeeConfig) {
        breakdown.lateBookingFee = lateFeeConfig.fixed_amount || 
          (breakdown.subtotal * lateFeeConfig.percentage);
      }
    }

    breakdown.total = breakdown.subtotal - breakdown.studentDiscount + breakdown.lateBookingFee;
    
    console.log('[PRICING] Final Breakdown:', {
      basePrice: breakdown.basePrice,
      itemValue: breakdown.itemValue,
      distanceCost: breakdown.distanceCost,
      carryingCost: breakdown.carryingCost,
      assemblyCost: breakdown.assemblyCost,
      extraHelperCost: breakdown.extraHelperCost,
      subtotal: breakdown.subtotal,
      studentDiscount: breakdown.studentDiscount,
      lateBookingFee: breakdown.lateBookingFee,
      total: breakdown.total
    });
    console.log('========== PRICING CALCULATION END ==========\n');

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

    let finalCharge = 0;
    let chargeType = '';
    let isCheapRate = false;

    // ReHome can suggest option - always cheapest
    if (input.isDateFlexible) {
      finalCharge = pickupRates.cityDay;
      isCheapRate = true;
      chargeType = 'ReHome Choose - Cheapest Rate';
    } else if (!input.isDateFlexible && input.selectedDateRange?.start && input.selectedDateRange?.end) {
      // Flexible date range
      const startDate = new Date(input.selectedDateRange.start);
      const endDate = new Date(input.selectedDateRange.end);
      const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (rangeDays > 7) {
        // Above one week - display cheap base charge for pickup city
        finalCharge = pickupRates.cityDay;
        isCheapRate = true;
        chargeType = 'Flexible Range >7 days - City Day Rate';
      } else {
        // Below one week - check if cities are included in calendar
        const cityDays = await getCityDaysInRangeCached(
          pickupCity,
          input.selectedDateRange.start,
          input.selectedDateRange.end
        );
        const hasCityDaysInRange = (cityDays || []).length > 0;

        if (pickupCity === dropoffCity) {
          // Within city
          if (hasCityDaysInRange) {
            finalCharge = pickupRates.cityDay;
            isCheapRate = true;
            chargeType = 'Flexible Range - City Available';
          } else {
            // Not available (even if empty date in range)
            finalCharge = pickupRates.normal;
            chargeType = 'Flexible Range - City Not Available';
          }
        } else {
          // Between cities
          const dropoffCityDays = await getCityDaysInRangeCached(
            dropoffCity,
            input.selectedDateRange.start,
            input.selectedDateRange.end
          );
          const hasDropoffCityDaysInRange = (dropoffCityDays || []).length > 0;
          
          if (hasCityDaysInRange && hasDropoffCityDaysInRange) {
            // Both cities included on same date within range
            finalCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
            isCheapRate = true;
            chargeType = 'Flexible Range - Both Cities Available';
          } else {
            // Not both available - use standard charge for pickup city
            finalCharge = pickupRates.normal;
            chargeType = 'Flexible Range - Standard Rate';
          }
        }
      }
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

        [finalCharge, chargeType, isCheapRate] = await this.calculateIntercityItemTransportCharge(
          input,
          pickupCity,
          dropoffCity,
          pickupRates,
          dropoffRates
        );
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

        const isIncludedPickup = !!pickupStatus?.isScheduled;
        const isIncludedDropoff = !!dropoffStatus?.isScheduled;
        const isEmpty = !!pickupStatus?.isEmpty && !!dropoffStatus?.isEmpty;
        const isSameCity = pickupCity === dropoffCity;

        // House Moving Fixed Date logic
        if (isSameCity) {
          // Within City
          if (isIncludedPickup) {
            // City included in calendar on that date
            finalCharge = pickupRates.cityDay;
            isCheapRate = true;
            chargeType = 'City Day Rate - Scheduled';
          } else if (isEmpty) {
            // Empty day = 75% of standard charge
            finalCharge = pickupRates.normal * 0.75;
            chargeType = 'Empty Day - 75% Standard';
          } else {
            // City not included in calendar
            finalCharge = pickupRates.normal;
            chargeType = 'Standard Rate';
          }
        } else {
          // Between Cities
          if (isIncludedPickup && isIncludedDropoff) {
            // Both cities included
            finalCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
            isCheapRate = true;
            chargeType = 'Intercity - Both Scheduled';
          } else if (isIncludedPickup && !isIncludedDropoff) {
            // Only pickup included
            finalCharge = (pickupRates.cityDay + dropoffRates.normal) / 2;
            chargeType = 'Intercity - Pickup Scheduled';
          } else if (!isIncludedPickup && isIncludedDropoff) {
            // Only dropoff included  
            finalCharge = (pickupRates.normal + dropoffRates.cityDay) / 2;
            chargeType = 'Intercity - Dropoff Scheduled';
          } else if (isEmpty) {
            // Empty day = 75% of higher standard charge
            finalCharge = Math.max(pickupRates.normal, dropoffRates.normal) * 0.75;
            chargeType = 'Intercity Empty Day - 75% Higher Standard';
          } else {
            // None included - use higher standard base charge
            finalCharge = Math.max(pickupRates.normal, dropoffRates.normal);
            chargeType = 'Intercity - Higher Standard Rate';
          }
        }
      } else {
        finalCharge = pickupRates.normal;
        chargeType = 'Standard Rate';
      }
    }

    return {
      city: pickupCity,
      isCityDay: isCheapRate,
      originalPrice: finalCharge,
      finalPrice: finalCharge,
      type: chargeType
    };
  }

  async calculateIntercityItemTransportCharge(input, pickupCity, dropoffCity, pickupRates, dropoffRates) {
    const [pickupStatus, dropoffStatus] = await Promise.all([
      getCityScheduleStatusCached(pickupCity, input.pickupDate),
      getCityScheduleStatusCached(dropoffCity, input.dropoffDate)
    ]);

    const isEmptyPickup = !!pickupStatus?.isEmpty;
    const isEmptyDropoff = !!dropoffStatus?.isEmpty;
    const isIncludedPickup = !!pickupStatus?.isScheduled;
    const isIncludedDropoff = !!dropoffStatus?.isScheduled;

    const isSameDate = input.pickupDate === input.dropoffDate;
    const isSameCity = pickupCity === dropoffCity;

    let baseCharge = 0;
    let chargeType = '';
    let isCheapRate = false;

    // Item Transport Fixed Date logic
    if (isSameCity && isSameDate) {
      // Within city, same date
      if (isIncludedPickup) {
        baseCharge = pickupRates.cityDay;
        chargeType = 'Same City/Date - Scheduled';
        isCheapRate = true;
      } else if (isEmptyPickup) {
        // Empty day = 75% of standard charge
        baseCharge = pickupRates.normal * 0.75;
        chargeType = 'Same City/Date - Empty (75%)';
      } else {
        baseCharge = pickupRates.normal;
        chargeType = 'Same City/Date - Standard';
      }
    } else if (isSameCity && !isSameDate) {
      // Within city, different dates
      if (isIncludedPickup && isIncludedDropoff) {
        // Both dates included
        baseCharge = pickupRates.cityDay;
        chargeType = 'Same City/Diff Dates - Both Scheduled';
        isCheapRate = true;
      } else if ((isIncludedPickup || isIncludedDropoff) && !(isIncludedPickup && isIncludedDropoff)) {
        // Only one date included (regardless of other being empty or not)
        baseCharge = (pickupRates.cityDay + pickupRates.normal) / 2;
        chargeType = 'Same City/Diff Dates - One Scheduled';
      } else if (isEmptyPickup && isEmptyDropoff) {
        // Both dates empty = 75% of standard
        baseCharge = pickupRates.normal * 0.75;
        chargeType = 'Same City/Diff Dates - Both Empty (75%)';
      } else {
        // Neither included
        baseCharge = pickupRates.normal;
        chargeType = 'Same City/Diff Dates - Standard';
      }
    } else if (!isSameCity && isSameDate) {
      // Between cities, same date
      if (isIncludedPickup && isIncludedDropoff) {
        // Both cities included
        baseCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
        chargeType = 'Intercity/Same Date - Both Scheduled';
        isCheapRate = true;
      } else if ((isIncludedPickup && !isIncludedDropoff) || (!isIncludedPickup && isIncludedDropoff)) {
        // Only one city included
        const includedRate = isIncludedPickup ? pickupRates.cityDay : dropoffRates.cityDay;
        const notIncludedRate = isIncludedPickup ? dropoffRates.normal : pickupRates.normal;
        baseCharge = (includedRate + notIncludedRate) / 2;
        chargeType = 'Intercity/Same Date - One Scheduled';
      } else if (isEmptyPickup || isEmptyDropoff) {
        // Date is empty
        baseCharge = (pickupRates.normal + dropoffRates.normal) / 2;
        chargeType = 'Intercity/Same Date - Empty';
      } else {
        // Neither city included
        baseCharge = Math.max(pickupRates.normal, dropoffRates.normal);
        chargeType = 'Intercity/Same Date - Higher Standard';
      }
    } else {
      // Between cities, different dates
      if (isIncludedPickup && isIncludedDropoff) {
        // Both cities included on their dates
        baseCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
        chargeType = 'Intercity/Diff Dates - Both Scheduled';
        isCheapRate = true;
      } else if ((isIncludedPickup && !isIncludedDropoff) || (!isIncludedPickup && isIncludedDropoff)) {
        // Only one city included (regardless of other being empty or not)
        const includedRate = isIncludedPickup ? pickupRates.cityDay : dropoffRates.cityDay;
        const notIncludedRate = isIncludedPickup ? dropoffRates.normal : pickupRates.normal;
        baseCharge = (includedRate + notIncludedRate) / 2;
        chargeType = 'Intercity/Diff Dates - One Scheduled';
      } else if (isEmptyPickup && isEmptyDropoff) {
        // Both days empty
        baseCharge = (pickupRates.normal + dropoffRates.normal) / 2;
        chargeType = 'Intercity/Diff Dates - Both Empty';
      } else {
        // None of the dates include respective city
        baseCharge = Math.max(pickupRates.normal, dropoffRates.normal);
        chargeType = 'Intercity/Diff Dates - Higher Standard';
      }
    }

    return [baseCharge, chargeType, isCheapRate];
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
    
    // Calculate floors (use 1st floor if elevator)
    const rawPickupFloors = pickupFloors || 0;
    const rawDropoffFloors = dropoffFloors || 0;

    const effectivePickupFloors = hasElevatorPickup ? Math.min(1, rawPickupFloors) : rawPickupFloors;
    const effectiveDropoffFloors = hasElevatorDropoff ? Math.min(1, rawDropoffFloors) : rawDropoffFloors;
    const totalFloors = effectivePickupFloors + effectiveDropoffFloors;
    
    if (totalFloors === 0) {
      return { floors: 0, itemBreakdown: [], totalCost: 0 };
    }
    
    // Calculate cost per item
    items.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (!furnitureItem) return;
      
      const points = furnitureItem.points * item.quantity;
      totalPoints += points;
      
      const itemNameLower = furnitureItem.name?.toLowerCase() || '';

      let itemType = 'standard';
      let multiplier = 1.35; // Default standard multiplier
      
      if (itemNameLower.includes('box')) {
        itemType = 'box';
        multiplier = 0.5; // Boxes use 0.5 multiplier per your requirements
      } else if (itemNameLower.includes('bag')) {
        itemType = 'bag';
        multiplier = 0.5; // Bags also use reduced multiplier
      } else if (itemNameLower.includes('luggage')) {
        itemType = 'luggage';
        multiplier = 0.5; // Luggage uses reduced multiplier
      }
      
      // Check if there's a specific config that overrides
      const itemConfig = carryingConfigByType.get(itemType);
      if (itemConfig && itemConfig.multiplier_per_floor != null) {
        multiplier = itemConfig.multiplier_per_floor;
      }
      
      const cost = points * multiplier * totalFloors;
      totalCost += cost;
      
      itemBreakdown.push({
        name: furnitureItem.name,
        quantity: item.quantity,
        points,
        floors: totalFloors,
        multiplier,
        cost
      });
    });
    
    const shouldApplyBaseFee =
      totalCost > 0 &&
      (BASE_FEE_THRESHOLD === null || BASE_FEE_THRESHOLD === undefined || totalPoints < BASE_FEE_THRESHOLD);

    if (shouldApplyBaseFee) {
      totalCost += BASE_FEE;
    }
    
    return {
      floors: totalFloors,
      itemBreakdown,
      totalCost
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
   * Helper: Find closest city from Google Place object
   * If no exact match, finds the nearest major city
   */
  findClosestCity(placeObject, cityCharges) {
    if (!placeObject) {
      console.log('[DEBUG] findClosestCity - placeObject is null/undefined');
      return null;
    }
    
    console.log('[DEBUG] ====== findClosestCity START ======');
    console.log('[DEBUG] findClosestCity - placeObject keys:', Object.keys(placeObject));
    console.log('[DEBUG] findClosestCity - placeObject.city:', placeObject.city);
    console.log('[DEBUG] findClosestCity - placeObject.formattedAddress:', placeObject.formattedAddress);
    console.log('[DEBUG] findClosestCity - placeObject.displayName:', placeObject.displayName);
    console.log('[DEBUG] findClosestCity - placeObject.text:', placeObject.text);
    
    // PRIORITY 1: Use the extracted city field directly if available
    if (placeObject.city) {
      const cityName = placeObject.city.toLowerCase();
      console.log('[DEBUG] findClosestCity - Using extracted city field:', cityName);
      
      // Direct match on city name
      const directMatch = cityCharges.find((c) =>
        c.city_name?.toLowerCase() === cityName ||
        cityName.includes(c.city_name?.toLowerCase()) ||
        c.city_name?.toLowerCase().includes(cityName)
      );
      
      if (directMatch) {
        console.log('[DEBUG] findClosestCity - Direct city match:', directMatch.city_name);
        return directMatch;
      }
      
      // Handle special cases like "Den Haag" -> "The Hague", "'s-Gravenhage" -> "The Hague"
      const cityVariations = {
        'den haag': 'The Hague',
        'the hague': 'The Hague',
        "'s-gravenhage": 'The Hague',
        's-gravenhage': 'The Hague',
        "'s-hertogenbosch": 's-Hertogenbosch',
        'den bosch': 's-Hertogenbosch'
      };
      
      const normalizedCity = cityVariations[cityName] || cityVariations[cityName.replace(/'/g, "'")];
      if (normalizedCity) {
        const variantMatch = cityCharges.find((c) => c.city_name === normalizedCity);
        if (variantMatch) {
          console.log('[DEBUG] findClosestCity - Variant city match:', variantMatch.city_name);
          return variantMatch;
        }
      }
    }
    
    // PRIORITY 2: Search within formattedAddress, displayName, text
    const searchText = (
      placeObject.formattedAddress?.toLowerCase() ||
      placeObject.displayName?.toLowerCase() || 
      placeObject.text?.toLowerCase() || 
      ''
    );
    
    console.log('[DEBUG] findClosestCity - searchText:', searchText);
    console.log('[DEBUG] findClosestCity - available cities:', cityCharges.map(c => c.city_name));
    
    if (!searchText) {
      console.log('[DEBUG] findClosestCity - No search text extracted');
      // FALLBACK: Return nearest major city (Amsterdam as default)
      const fallbackCity = cityCharges.find(c => c.city_name === 'Amsterdam') || cityCharges[0];
      if (fallbackCity) {
        console.log('[WARN] findClosestCity - Using fallback city:', fallbackCity.city_name);
        return fallbackCity;
      }
      return null;
    }

    // Match against configured cities - check if city name appears in the search text
    const match = cityCharges.find((c) =>
      searchText.includes(c.city_name?.toLowerCase())
    );
    
    if (match) {
      console.log('[DEBUG] findClosestCity - match result:', match.city_name);
      return match;
    }
    
    // FALLBACK: No match found - find geographically closest city
    console.log('[WARN] findClosestCity - No exact match, finding geographically closest city');
    
    // If we have coordinates, find the geographically closest city
    if (placeObject.coordinates?.lat && placeObject.coordinates?.lng) {
      const closestCity = this.findGeographicallyClosestCity(placeObject.coordinates, cityCharges);
      if (closestCity) {
        console.log('[WARN] findClosestCity - Using geographically closest city:', closestCity.city_name);
        return closestCity;
      }
    }
    
    // Ultimate fallback: use the first available city
    const fallbackCity = cityCharges[0];
    if (fallbackCity) {
      console.log('[WARN] findClosestCity - Using first available city as fallback:', fallbackCity.city_name);
      return fallbackCity;
    }
    
    console.log('[ERROR] findClosestCity - No cities available at all');
    return null;
  }

  /**
   * Find geographically closest city using straight-line distance
   * Uses coordinates from city_base_charges table (single source of truth)
   */
  findGeographicallyClosestCity(coordinates, cityCharges) {
    let closestCity = null;
    let minDistance = Infinity;

    for (const city of cityCharges) {
      // Use coordinates from database (latitude/longitude columns)
      if (city.latitude && city.longitude) {
        const distance = this.calculateStraightLineDistance(
          coordinates.lat,
          coordinates.lng,
          parseFloat(city.latitude),
          parseFloat(city.longitude)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestCity = city;
        }
      }
    }

    return closestCity;
  }

  /**
   * Calculate straight-line distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
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

  /**
   * Get month pricing for calendar display
   * Returns base pricing for each day of a month based on pickup/dropoff cities
   * Cached for 5 minutes per month/city combo
   */
  async getMonthPricing({ year, month, pickupCity, dropoffCity, startDate, endDate }) {
    const cacheKey = `month_pricing_${year}_${month}_${pickupCity}_${dropoffCity}`;
    const cached = pricingCache.get(cacheKey);
    if (cached) {
      console.log('[MONTH-PRICING] Cache hit for', cacheKey);
      return cached;
    }

    console.log('[MONTH-PRICING] Cache miss, calculating for', cacheKey);

    const config = await this.getPricingConfig();
    const days = [];

    // Find city charges
    const pickupCityRow = config.cityCharges?.find(c => 
      c.city_name?.toLowerCase() === pickupCity?.toLowerCase()
    );
    const dropoffCityRow = config.cityCharges?.find(c => 
      c.city_name?.toLowerCase() === dropoffCity?.toLowerCase()
    );

    // Fallback to first city if not found
    const pickupRates = pickupCityRow || config.cityCharges?.[0] || { normal: 89, city_day: 64 };
    const dropoffRates = dropoffCityRow || config.cityCharges?.[0] || { normal: 89, city_day: 64 };

    const isSameCity = pickupCity?.toLowerCase() === dropoffCity?.toLowerCase();

    // Get all schedule data for the month
    const { data: scheduleData } = await supabase
      .from('city_schedules')
      .select('*')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate);

    // Get blocked dates for the month
    const { data: blockedDates } = await supabase
      .from('blocked_dates')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    // Create lookup maps
    const scheduleMap = new Map();
    scheduleData?.forEach(s => {
      if (!scheduleMap.has(s.scheduled_date)) {
        scheduleMap.set(s.scheduled_date, []);
      }
      scheduleMap.get(s.scheduled_date).push(s.city_name);
    });

    const blockedSet = new Set();
    blockedDates?.forEach(b => blockedSet.add(b.date));

    // Calculate pricing for each day
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const assignedCities = scheduleMap.get(dateStr) || [];
      const isBlocked = blockedSet.has(dateStr);
      const isEmpty = assignedCities.length === 0;

      // Check if pickup/dropoff cities are scheduled
      const pickupScheduled = assignedCities.includes(pickupCity);
      const dropoffScheduled = assignedCities.includes(dropoffCity);

      let basePrice = 0;
      let isCityDay = false;
      let priceType = '';

      // Color Logic:
      // Same City: Green=city scheduled, Orange=empty, Red=not scheduled
      // Intercity: Green=both scheduled, Orange=one scheduled OR empty, Red=neither scheduled
      let colorCode = 'red'; // Default: expensive/not scheduled
      
      if (isSameCity) {
        // Same city pricing
        if (pickupScheduled) {
          // City IS scheduled for this day - GREEN (cheapest)
          basePrice = pickupRates.city_day || pickupRates.cityDay || 64;
          isCityDay = true;
          priceType = 'City Day Rate';
          colorCode = 'green';
        } else if (isEmpty) {
          // Empty day (no cities scheduled) - ORANGE (medium price)
          basePrice = pickupRates.city_day || pickupRates.cityDay || 64;
          isCityDay = false;
          priceType = 'Empty Day Rate';
          colorCode = 'orange';
        } else {
          // City not scheduled, other cities are - RED (expensive)
          basePrice = pickupRates.normal || 89;
          priceType = 'Standard Rate';
          colorCode = 'red';
        }
      } else {
        // Intercity pricing
        if (pickupScheduled && dropoffScheduled) {
          // BOTH cities scheduled - GREEN (cheapest)
          basePrice = ((pickupRates.city_day || pickupRates.cityDay || 64) + (dropoffRates.city_day || dropoffRates.cityDay || 64)) / 2;
          isCityDay = true;
          priceType = 'Intercity City Day Rate';
          colorCode = 'green';
        } else if (pickupScheduled || dropoffScheduled || isEmpty) {
          // ONE city scheduled OR empty day - ORANGE (medium)
          if (pickupScheduled) {
            basePrice = ((pickupRates.city_day || pickupRates.cityDay || 64) + (dropoffRates.normal || 89)) / 2;
            priceType = 'Intercity Partial Rate (Pickup City)';
          } else if (dropoffScheduled) {
            basePrice = ((pickupRates.normal || 89) + (dropoffRates.city_day || dropoffRates.cityDay || 64)) / 2;
            priceType = 'Intercity Partial Rate (Dropoff City)';
          } else {
            // Empty day
            basePrice = ((pickupRates.city_day || pickupRates.cityDay || 64) + (dropoffRates.city_day || dropoffRates.cityDay || 64)) / 2;
            priceType = 'Empty Day Rate';
          }
          isCityDay = false;
          colorCode = 'orange';
        } else {
          // Neither city scheduled - RED (expensive)
          basePrice = pickupRates.normal || 89;
          priceType = 'Intercity Standard Rate';
          colorCode = 'red';
        }
      }

      days.push({
        date: dateStr,
        basePrice: Math.round(basePrice * 100) / 100,
        isCityDay,
        isEmpty,
        priceType,
        assignedCities,
        isBlocked,
        colorCode
      });
    }

    const result = { days, pickupCity, dropoffCity, isSameCity };
    pricingCache.set(cacheKey, result);
    
    console.log('[MONTH-PRICING] Calculated', days.length, 'days for', cacheKey);
    return result;
  }
}

export default new SupabasePricingService();
