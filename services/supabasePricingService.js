import NodeCache from 'node-cache';
import { supabaseClient } from '../db/params.js';

// Use shared Supabase client
const supabase = supabaseClient;

// Cache for pricing configuration (5 minutes TTL)
const pricingCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Supabase-based pricing service for backend calculations
 */
class SupabasePricingService {
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
    const { pickupLocation, dropoffLocation, selectedDate } = input;
    
    // Find the closest supported city
    const pickupCity = this.findClosestCity(pickupLocation, config.cityCharges);
    const dropoffCity = this.findClosestCity(dropoffLocation, config.cityCharges);
    
    // Use the higher base charge between pickup and dropoff
    const city = pickupCity?.normal > dropoffCity?.normal ? pickupCity : dropoffCity;
    
    if (!city) {
      return {
        city: null,
        isCityDay: false,
        originalPrice: 100, // Default base price
        finalPrice: 100,
        type: 'default'
      };
    }

    // Check if it's a city day
    const isCityDay = await this.isCityDay(city, selectedDate);
    const basePrice = isCityDay ? city.city_day : city.normal;

    return {
      city: city.city_name,
      isCityDay,
      originalPrice: basePrice,
      finalPrice: basePrice,
      type: isCityDay ? 'city_day' : 'normal'
    };
  }

  /**
   * Calculate item value based on points
   */
  calculateItemValue(input, config) {
    const { items } = input;
    if (!items || items.length === 0) {
      return { totalPoints: 0, multiplier: 1, cost: 0 };
    }

    let totalPoints = 0;
    items.forEach(item => {
      const furnitureItem = config.furnitureItems.find(f => f.id === item.id);
      if (furnitureItem) {
        totalPoints += furnitureItem.points * item.quantity;
      }
    });

    // Apply multiplier based on service type
    const multiplier = input.serviceType === 'house_moving' ? 2.0 : 1.0;
    
    return {
      totalPoints,
      multiplier,
      cost: totalPoints * multiplier
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

    const standardConfig = config.carryingConfig.find(c => c.item_type === 'standard');
    const boxConfig = config.carryingConfig.find(c => c.item_type === 'box');
    
    const STANDARD_MULTIPLIER = standardConfig?.multiplier_per_floor || 1.35;
    const BOX_MULTIPLIER = boxConfig?.multiplier_per_floor || 0.5;
    const BASE_FEE = standardConfig?.base_fee || 25;
    const BASE_FEE_THRESHOLD = standardConfig?.base_fee_threshold_points || 20;
    
    const itemBreakdown = [];
    let totalCost = 0;
    let totalPoints = 0;
    
    // Calculate floors (use 1st floor if elevator)
    const effectivePickupFloors = hasElevatorPickup ? 1 : (pickupFloors || 0);
    const effectiveDropoffFloors = hasElevatorDropoff ? 1 : (dropoffFloors || 0);
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
      
      // Determine multiplier based on item type
      const isBox = furnitureItem.name?.toLowerCase().includes('box') || 
                    furnitureItem.name?.toLowerCase().includes('bag') ||
                    furnitureItem.name?.toLowerCase().includes('luggage');
      const multiplier = isBox ? BOX_MULTIPLIER : STANDARD_MULTIPLIER;
      
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
    
    // Apply base fee if total points < threshold and carrying cost > 0
    if (totalPoints < BASE_FEE_THRESHOLD && totalCost > 0) {
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
    if (!placeObject) return null;
    
    // Extract city from Google Place object structure
    // Google Place object has: { text, placeId, coordinates, city, postalCode, country, address }
    const cityName = placeObject.city?.toLowerCase() || 
                     placeObject.town?.toLowerCase() || 
                     placeObject.address?.toLowerCase() || 
                     '';
    
    if (!cityName) return null;

    // Match against configured cities
    return cityCharges.find((c) =>
      cityName.includes(c.city_name?.toLowerCase())
    );
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
