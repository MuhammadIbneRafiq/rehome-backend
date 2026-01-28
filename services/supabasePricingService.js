import NodeCache from 'node-cache';
import { supabaseClient } from '../db/params.js';
import {
  getCityScheduleStatusCached,
  getCityDaysInRangeCached,
  isDateBlockedCached
} from './cacheService.js';

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
    breakdown.basePrice = baseCharge.finalPrice;
    breakdown.breakdown.baseCharge = baseCharge;

    // 2. Calculate item value
    const itemValue = this.calculateItemValue(input, config);
    breakdown.itemValue = itemValue.cost;
    breakdown.breakdown.items = itemValue;

    // 3. Calculate distance cost
    const distanceCost = await this.calculateDistanceCost(input, config);
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

    if (input.isDateFlexible) {
      finalCharge = pickupRates.cityDay;
      isCheapRate = true;
      chargeType = 'City Day Rate';
    } else if (!input.isDateFlexible && input.selectedDateRange?.start && input.selectedDateRange?.end) {
      const startDate = new Date(input.selectedDateRange.start);
      const endDate = new Date(input.selectedDateRange.end);
      const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (rangeDays > 7) {
        finalCharge = pickupRates.cityDay;
        isCheapRate = true;
        chargeType = 'City Day Rate';
      } else {
        const cityDays = await getCityDaysInRangeCached(
          pickupCity,
          input.selectedDateRange.start,
          input.selectedDateRange.end
        );
        const hasCityDaysInRange = (cityDays || []).length > 0;

        if (pickupCity === dropoffCity) {
          if (hasCityDaysInRange) {
            finalCharge = pickupRates.cityDay;
            isCheapRate = true;
            chargeType = 'City Day Rate';
          } else {
            finalCharge = pickupRates.normal;
            chargeType = 'Standard Rate';
          }
        } else {
          chargeType = 'Intercity Rate';
          if (hasCityDaysInRange) {
            finalCharge = (pickupRates.cityDay + dropoffRates.normal) / 2;
          } else {
            finalCharge = pickupRates.normal;
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

        if (isSameCity) {
          if (isIncludedPickup || isEmpty) {
            finalCharge = pickupRates.cityDay;
            isCheapRate = true;
            chargeType = 'City Day Rate';
          } else {
            finalCharge = pickupRates.normal;
            chargeType = 'Standard Rate';
          }
        } else {
          chargeType = 'Intercity Rate';
          if (isEmpty) {
            finalCharge = (pickupRates.cityDay + dropoffRates.normal) / 2;
            isCheapRate = true;
          } else if (isIncludedPickup && isIncludedDropoff) {
            finalCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
            isCheapRate = true;
          } else if (isIncludedPickup && !isIncludedDropoff) {
            finalCharge = (pickupRates.cityDay + dropoffRates.normal) / 2;
          } else if (!isIncludedPickup && isIncludedDropoff) {
            finalCharge = (pickupRates.normal + dropoffRates.cityDay) / 2;
          } else {
            finalCharge = Math.max(pickupRates.normal, dropoffRates.normal);
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

    const cheapPickup = isIncludedPickup || isEmptyPickup;
    const cheapDropoff = isIncludedDropoff || isEmptyDropoff;

    const isSameDate = input.pickupDate === input.dropoffDate;
    const isSameCity = pickupCity === dropoffCity;

    let baseCharge = 0;
    let chargeType = '';
    let isCheapRate = false;

    if (isSameCity && isSameDate) {
      if (cheapPickup) {
        baseCharge = pickupRates.cityDay;
        chargeType = 'City Day Rate';
        isCheapRate = true;
      } else {
        baseCharge = pickupRates.normal;
        chargeType = 'Standard Rate';
      }
    } else if (isSameCity && !isSameDate) {
      if (cheapPickup && cheapDropoff) {
        baseCharge = pickupRates.cityDay;
        chargeType = 'City Day Rate';
        isCheapRate = true;
      } else if ((cheapPickup && !cheapDropoff) || (!cheapPickup && cheapDropoff)) {
        baseCharge = (pickupRates.cityDay + pickupRates.normal) / 2;
        chargeType = 'Mixed Rate';
      } else {
        baseCharge = pickupRates.normal;
        chargeType = 'Standard Rate';
      }
    } else {
      chargeType = 'Intercity Rate';
      if (cheapPickup && cheapDropoff) {
        baseCharge = (pickupRates.cityDay + dropoffRates.cityDay) / 2;
        isCheapRate = true;
      } else if (cheapPickup && !cheapDropoff) {
        baseCharge = (pickupRates.cityDay + dropoffRates.normal) / 2;
      } else if (!cheapPickup && cheapDropoff) {
        baseCharge = (pickupRates.normal + dropoffRates.cityDay) / 2;
      } else {
        baseCharge = Math.max(pickupRates.normal, dropoffRates.normal);
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
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      console.log('[DEBUG] calculateItemValue - item:', item.id, 'found:', !!furnitureItem, 'points:', furnitureItem?.points);
      if (furnitureItem) {
        const itemPoints = parseFloat(furnitureItem.points) * item.quantity;
        totalPoints += itemPoints;
        console.log('[DEBUG] calculateItemValue - adding points:', itemPoints, 'total now:', totalPoints);
      }
    });

    // Apply multiplier based on service type
    const multiplier = input.serviceType === 'house_moving' ? 2.0 : 1.0;
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
    const pickupFloors = input.pickupFloors || input.floorPickup || 0;
    const dropoffFloors = input.dropoffFloors || input.floorDropoff || 0;
    const hasElevatorPickup = input.hasElevatorPickup || input.elevatorPickup || false;
    const hasElevatorDropoff = input.hasElevatorDropoff || input.elevatorDropoff || false;
    
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
    
    if (!items.length || (!pickupFloors && !dropoffFloors)) {
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
      if (itemNameLower.includes('box')) itemType = 'box';
      else if (itemNameLower.includes('bag')) itemType = 'bag';
      else if (itemNameLower.includes('luggage')) itemType = 'luggage';

      const itemConfig = carryingConfigByType.get(itemType) || standardConfig;
      const multiplier = itemConfig?.multiplier_per_floor ?? 1.35;
      
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
    const { items, needsAssembly, isMarketplace } = input;
    
    if (!needsAssembly || !items || items.length === 0) {
      return { itemBreakdown: [], totalCost: 0 };
    }
    
    const itemBreakdown = [];
    let totalCost = 0;
    
    items.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (!furnitureItem) return;
      
      // Determine item category
      let category = null;
      const itemName = furnitureItem.name.toLowerCase();
      
      if (itemName.includes('bed')) category = 'bed';
      else if (itemName.includes('wardrobe') || itemName.includes('closet')) category = 'closet';
      else if (itemName.includes('table') || itemName.includes('desk')) category = 'table';
      else if (itemName.includes('sofa')) category = 'sofa';
      
      if (!category) return;
      
      // Find pricing for this category
      const assemblyPrice = config.assemblyPricing.find(a => 
        a.item_category === category && 
        a.item_type.toLowerCase() === itemName
      );
      
      if (!assemblyPrice) return;
      
      const price = isMarketplace && assemblyPrice.marketplace_price ? 
        assemblyPrice.marketplace_price : assemblyPrice.price;
      
      const cost = price * item.quantity;
      totalCost += cost;
      
      itemBreakdown.push({
        name: furnitureItem.name,
        quantity: item.quantity,
        pricePerItem: price,
        cost
      });
    });
    
    return {
      itemBreakdown,
      totalCost
    };
  }

  /**
   * Calculate extra helper cost
   */
  calculateExtraHelperCost(input, config) {
    const { items, needsExtraHelper } = input;
    
    if (!needsExtraHelper) {
      return { totalPoints: 0, category: 'none', cost: 0 };
    }
    
    let totalPoints = 0;
    items?.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (furnitureItem) {
        totalPoints += furnitureItem.points * item.quantity;
      }
    });
    
    // Find appropriate helper config
    const smallHelper = config.extraHelper.find(h => h.item_threshold <= 30);
    const bigHelper = config.extraHelper.find(h => h.item_threshold > 30);
    
    let cost = 0;
    let category = 'none';
    
    if (totalPoints <= 30) {
      cost = smallHelper?.price || 150;
      category = 'small';
    } else {
      cost = bigHelper?.price || 250;
      category = 'big';
    }
    
    return {
      totalPoints,
      category,
      cost
    };
  }

  /**
   * Helper: Find closest city from Google Place object
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
      
      // Handle special cases like "Den Haag" -> "The Hague"
      const cityVariations = {
        'den haag': 'The Hague',
        'the hague': 'The Hague',
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
      return null;
    }

    // Match against configured cities - check if city name appears in the search text
    const match = cityCharges.find((c) =>
      searchText.includes(c.city_name?.toLowerCase())
    );
    
    console.log('[DEBUG] findClosestCity - match result:', match?.city_name || 'NO MATCH');
    
    return match;
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
   * Helper: Calculate distance between two points
   */
  async calculateDistance(pickup, dropoff) {
    // In production, use Google Maps Distance Matrix API
    // For now, return a mock distance
    return 15; // km
  }
}

export default new SupabasePricingService();
