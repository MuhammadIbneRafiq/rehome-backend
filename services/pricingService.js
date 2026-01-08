import { 
  getCityScheduleStatusCached,
  getCityDaysInRangeCached,
  getFurnitureItemsCached,
  getPricingConfigCached,
  getCityBaseChargesCached,
  cachePricingResult,
  getCachedPricingResult
} from './cacheService.js';
import axios from 'axios';

/**
 * Server-side pricing service with caching and optimization
 * This replaces client-side pricing calculations
 */
class PricingService {
  constructor() {
    this.pricingConfig = null;
    this.cityBaseCharges = null;
    this.furnitureItems = null;
    this.initialized = false;
  }

  /**
   * Initialize the service with cached data
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load all constants from cache or database
      this.pricingConfig = await getPricingConfigCached();
      this.cityBaseCharges = await getCityBaseChargesCached();
      this.furnitureItems = await getFurnitureItemsCached();
      
      this.initialized = true;
      console.log('✅ Pricing service initialized with cached data');
    } catch (error) {
      console.error('❌ Error initializing pricing service:', error);
      throw error;
    }
  }

  /**
   * Main pricing calculation method with caching
   */
  async calculatePricing(input) {
    // Ensure service is initialized
    await this.initialize();
    
    // Check cache first
    const cached = getCachedPricingResult(input);
    if (cached) {
      console.log('💰 Returning cached pricing result');
      return cached;
    }
    
    // Calculate pricing
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
      earlyBookingDiscount: 0,
      breakdown: {
        baseCharge: {
          city: null,
          isCityDay: false,
          isEarlyBooking: false,
          originalPrice: 0,
          finalPrice: 0,
        },
        items: {
          totalPoints: 0,
          multiplier: 0,
          cost: 0,
        },
        distance: {
          distanceKm: 0,
          category: 'small',
          rate: 0,
          cost: 0,
        },
        carrying: {
          floors: 0,
          itemBreakdown: [],
          totalCost: 0,
        },
        assembly: {
          itemBreakdown: [],
          totalCost: 0,
        },
        extraHelper: {
          totalPoints: 0,
          category: 'small',
          cost: 0,
        },
      },
    };

    // Calculate components in parallel where possible
    const [baseChargeResult, distanceResult] = await Promise.all([
      this.calculateBaseChargeBreakdown(input),
      this.calculateDistanceBreakdown(input)
    ]);

    // Apply results
    breakdown.basePrice = baseChargeResult.basePrice;
    breakdown.breakdown.baseCharge = baseChargeResult.baseCharge;
    breakdown.distanceCost = distanceResult.cost;
    breakdown.breakdown.distance = distanceResult.distance;

    // Calculate other components (synchronous)
    this.calculateItemValue(input, breakdown);
    this.calculateCarryingCost(input, breakdown);
    this.calculateAssemblyCost(input, breakdown);
    this.calculateExtraHelperCost(input, breakdown);
    this.calculateTotals(input, breakdown);

    // Cache the result
    cachePricingResult(input, breakdown);
    
    return breakdown;
  }

  /**
   * Calculate base charge with caching
   */
  async calculateBaseChargeBreakdown(input) {
    const pickupCity = this.findClosestCity(input.pickupLocation);
    const dropoffCity = this.findClosestCity(input.dropoffLocation);
    
    if (!pickupCity || !dropoffCity) {
      return {
        basePrice: 0,
        baseCharge: {
          city: null,
          isCityDay: false,
          isEarlyBooking: false,
          originalPrice: 0,
          finalPrice: 0,
          type: 'Location not supported'
        }
      };
    }

    let finalCharge = 0;
    let chargeType = '';
    let isCheapRate = false;

    // Fixed date pricing
    if (!input.isDateFlexible && !input.selectedDateRange?.end) {
      if (input.serviceType === 'item-transport' && input.pickupDate && input.dropoffDate) {
        [finalCharge, chargeType] = await this.calculateIntercityItemTransportCharge(
          input, pickupCity, dropoffCity
        );
      } else if (input.serviceType === 'house-moving') {
        const selectedDate = new Date(input.selectedDate);
        
        // Use cached city schedule status
        const [pickupStatus, dropoffStatus] = await Promise.all([
          getCityScheduleStatusCached(pickupCity, input.selectedDate),
          getCityScheduleStatusCached(dropoffCity, input.selectedDate)
        ]);
        
        const isIncludedPickup = pickupStatus.isScheduled;
        const isIncludedDropoff = dropoffStatus.isScheduled;
        const isEmpty = pickupStatus.isEmpty && dropoffStatus.isEmpty;
        
        const isSameCity = dropoffCity === pickupCity;
        
        if (isSameCity) {
          if (isIncludedPickup || isEmpty) {
            finalCharge = this.cityBaseCharges[pickupCity]?.cityDay || 0;
            isCheapRate = true;
            chargeType = 'City Day Rate';
          } else {
            finalCharge = this.cityBaseCharges[pickupCity]?.normal || 0;
            chargeType = 'Standard Rate';
          }
        } else {
          chargeType = 'Intercity Rate';
          if (isEmpty) {
            finalCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.normal) / 2;
            isCheapRate = true;
          } else if (isIncludedPickup && isIncludedDropoff) {
            finalCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.cityDay) / 2;
            isCheapRate = true;
          } else if (isIncludedPickup && !isIncludedDropoff) {
            finalCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.normal) / 2;
          } else if (!isIncludedPickup && isIncludedDropoff) {
            finalCharge = (this.cityBaseCharges[pickupCity]?.normal + this.cityBaseCharges[dropoffCity]?.cityDay) / 2;
          } else {
            finalCharge = Math.max(this.cityBaseCharges[pickupCity]?.normal, this.cityBaseCharges[dropoffCity]?.normal);
          }
        }
      }
    }
    // Flexible date range
    else if (!input.isDateFlexible && input.selectedDateRange?.start && input.selectedDateRange?.end) {
      const startDate = new Date(input.selectedDateRange.start);
      const endDate = new Date(input.selectedDateRange.end);
      const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      if (rangeDays > 7) {
        finalCharge = this.cityBaseCharges[pickupCity]?.cityDay;
        isCheapRate = true;
        chargeType = 'City Day Rate';
      } else {
        // Use cached city days check
        const cityDays = await getCityDaysInRangeCached(
          pickupCity, 
          input.selectedDateRange.start, 
          input.selectedDateRange.end
        );
        const hasCityDaysInRange = cityDays.length > 0;
        
        if (dropoffCity === pickupCity) {
          if (hasCityDaysInRange) {
            finalCharge = this.cityBaseCharges[pickupCity]?.cityDay;
            chargeType = 'City Day Rate';
          } else {
            finalCharge = this.cityBaseCharges[pickupCity]?.normal;
            chargeType = 'Standard Rate';
          }
        } else {
          chargeType = 'Intercity Rate';
          if (hasCityDaysInRange) {
            finalCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.normal) / 2;
          } else {
            finalCharge = this.cityBaseCharges[pickupCity]?.normal;
          }
        }
      }
    }
    // ReHome suggest date
    else if (input.isDateFlexible) {
      finalCharge = this.cityBaseCharges[pickupCity]?.cityDay || 0;
      isCheapRate = true;
      chargeType = 'City Day Rate';
    }

    return {
      basePrice: finalCharge,
      baseCharge: {
        city: pickupCity,
        isCityDay: isCheapRate,
        isEarlyBooking: false,
        originalPrice: finalCharge,
        finalPrice: finalCharge,
        type: chargeType
      }
    };
  }

  /**
   * Calculate distance cost
   */
  async calculateDistanceBreakdown(input) {
    const distanceKm = input.distanceKm || 0;
    
    let cost = 0;
    let category = 'small';
    let rate = 0;

    if (distanceKm < 10) {
      cost = 0;
      category = 'small';
      rate = 0;
    } else if (distanceKm <= 50) {
      cost = Math.round((distanceKm - 10) * 0.7);
      category = 'medium';
      rate = 0.7;
    } else {
      cost = Math.round(40 * 0.7 + (distanceKm - 50) * 0.5);
      category = 'long';
      rate = 0.5;
    }

    return {
      cost,
      distance: {
        distanceKm,
        category,
        rate,
        cost
      }
    };
  }

  /**
   * Calculate item value
   */
  calculateItemValue(input, breakdown) {
    let totalPoints = 0;
    
    if (input.itemQuantities) {
      for (const [itemId, quantity] of Object.entries(input.itemQuantities)) {
        if (quantity > 0) {
          const item = this.furnitureItems?.find(f => f.id === itemId);
          if (item) {
            totalPoints += item.base_points * quantity;
          }
        }
      }
    }

    const multiplier = this.pricingConfig?.points_to_euro_multiplier || 1;
    const cost = Math.round(totalPoints * multiplier);

    breakdown.itemValue = cost;
    breakdown.breakdown.items = {
      totalPoints,
      multiplier,
      cost
    };
  }

  /**
   * Calculate carrying cost
   */
  calculateCarryingCost(input, breakdown) {
    const floors = Math.max(input.floorPickup || 0, input.floorDropoff || 0);
    
    if (floors === 0 || (input.elevatorPickup && input.elevatorDropoff)) {
      breakdown.carryingCost = 0;
      breakdown.breakdown.carrying = {
        floors: 0,
        itemBreakdown: [],
        totalCost: 0
      };
      return;
    }

    const carryingMultiplier = this.pricingConfig?.carrying_multiplier || 0.25;
    const itemBreakdown = [];
    let totalCost = 0;

    // Calculate for specific items if provided
    if (input.carryingServiceItems) {
      for (const [itemId, shouldCarry] of Object.entries(input.carryingServiceItems)) {
        if (shouldCarry && input.itemQuantities?.[itemId] > 0) {
          const item = this.furnitureItems?.find(f => f.id === itemId);
          if (item) {
            const points = item.base_points * input.itemQuantities[itemId];
            const cost = Math.round(points * carryingMultiplier * floors);
            itemBreakdown.push({
              itemId,
              points,
              multiplier: carryingMultiplier * floors,
              cost
            });
            totalCost += cost;
          }
        }
      }
    }

    breakdown.carryingCost = totalCost;
    breakdown.breakdown.carrying = {
      floors,
      itemBreakdown,
      totalCost
    };
  }

  /**
   * Calculate assembly cost
   */
  calculateAssemblyCost(input, breakdown) {
    const assemblyMultiplier = this.pricingConfig?.assembly_multiplier || 0.2;
    const itemBreakdown = [];
    let totalCost = 0;

    // Combine assembly and disassembly items
    const allAssemblyItems = {
      ...(input.assemblyItems || {}),
      ...(input.disassemblyItems || {})
    };

    for (const [itemId, needsAssembly] of Object.entries(allAssemblyItems)) {
      if (needsAssembly && input.itemQuantities?.[itemId] > 0) {
        const item = this.furnitureItems?.find(f => f.id === itemId);
        if (item) {
          const points = item.base_points * input.itemQuantities[itemId];
          const cost = Math.round(points * assemblyMultiplier);
          itemBreakdown.push({
            itemId,
            points,
            multiplier: assemblyMultiplier,
            cost
          });
          totalCost += cost;
        }
      }
    }

    breakdown.assemblyCost = totalCost;
    breakdown.breakdown.assembly = {
      itemBreakdown,
      totalCost
    };
  }

  /**
   * Calculate extra helper cost
   */
  calculateExtraHelperCost(input, breakdown) {
    let totalPoints = 0;
    
    if (input.extraHelperItems) {
      for (const [itemId, needsHelper] of Object.entries(input.extraHelperItems)) {
        if (needsHelper && input.itemQuantities?.[itemId] > 0) {
          const item = this.furnitureItems?.find(f => f.id === itemId);
          if (item) {
            totalPoints += item.base_points * input.itemQuantities[itemId];
          }
        }
      }
    }

    let cost = 0;
    let category = 'small';

    if (totalPoints <= 20) {
      cost = 25;
      category = 'small';
    } else {
      cost = 35;
      category = 'big';
    }

    breakdown.extraHelperCost = totalPoints > 0 ? cost : 0;
    breakdown.breakdown.extraHelper = {
      totalPoints,
      category,
      cost: totalPoints > 0 ? cost : 0
    };
  }

  /**
   * Calculate totals and apply discounts
   */
  calculateTotals(input, breakdown) {
    // Calculate subtotal
    breakdown.subtotal = 
      breakdown.basePrice +
      breakdown.itemValue +
      breakdown.distanceCost +
      breakdown.carryingCost +
      breakdown.assemblyCost +
      breakdown.extraHelperCost;

    // Apply student discount
    if (input.isStudent && input.hasStudentId) {
      breakdown.studentDiscount = Math.round(breakdown.subtotal * 0.1);
    } else {
      breakdown.studentDiscount = 0;
    }

    // Calculate final total
    breakdown.total = Math.max(0, breakdown.subtotal - breakdown.studentDiscount - breakdown.earlyBookingDiscount);
  }

  /**
   * Calculate item transport charge with different dates
   */
  async calculateIntercityItemTransportCharge(input, pickupCity, dropoffCity) {
    const [pickupStatus, dropoffStatus] = await Promise.all([
      getCityScheduleStatusCached(pickupCity, input.pickupDate),
      getCityScheduleStatusCached(dropoffCity, input.dropoffDate)
    ]);

    const isEmptyPickup = pickupStatus.isEmpty;
    const isEmptyDropoff = dropoffStatus.isEmpty;
    const isIncludedPickup = pickupStatus.isScheduled;
    const isIncludedDropoff = dropoffStatus.isScheduled;

    const cheapPickup = isIncludedPickup || isEmptyPickup;
    const cheapDropoff = isIncludedDropoff || isEmptyDropoff;

    const isSameDate = input.pickupDate === input.dropoffDate;
    const isSameCity = dropoffCity === pickupCity;
    
    let baseCharge = 0;
    let chargeType = '';

    if (isSameCity && isSameDate) {
      if (cheapPickup) {
        baseCharge = this.cityBaseCharges[pickupCity]?.cityDay;
        chargeType = 'City Day Rate';
      } else {
        baseCharge = this.cityBaseCharges[pickupCity]?.normal;
        chargeType = 'Standard Rate';
      }
    } else if (isSameCity && !isSameDate) {
      if (cheapPickup && cheapDropoff) {
        baseCharge = this.cityBaseCharges[pickupCity]?.cityDay;
        chargeType = 'City Day Rate';
      } else if ((cheapPickup && !cheapDropoff) || (!cheapPickup && cheapDropoff)) {
        baseCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[pickupCity]?.normal) / 2;
        chargeType = 'Mixed Rate';
      } else {
        baseCharge = this.cityBaseCharges[pickupCity]?.normal;
        chargeType = 'Standard Rate';
      }
    } else {
      // Different cities
      chargeType = 'Intercity Rate';
      if (cheapPickup && cheapDropoff) {
        baseCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.cityDay) / 2;
      } else if (cheapPickup && !cheapDropoff) {
        baseCharge = (this.cityBaseCharges[pickupCity]?.cityDay + this.cityBaseCharges[dropoffCity]?.normal) / 2;
      } else if (!cheapPickup && cheapDropoff) {
        baseCharge = (this.cityBaseCharges[pickupCity]?.normal + this.cityBaseCharges[dropoffCity]?.cityDay) / 2;
      } else {
        baseCharge = Math.max(this.cityBaseCharges[pickupCity]?.normal, this.cityBaseCharges[dropoffCity]?.normal);
      }
    }

    return [baseCharge, chargeType];
  }

  /**
   * Find closest supported city from Google Place object
   */
  findClosestCity(placeObject) {
    if (!placeObject) return null;
    
    // Extract city from Google Place object structure
    // Google Place object has: { text, placeId, coordinates, city, postalCode, country, address }
    const cityName = placeObject.city?.toLowerCase() || 
                     placeObject.town?.toLowerCase() || 
                     placeObject.address?.toLowerCase() || 
                     '';
    
    if (!cityName) return null;
    
    const cities = Object.keys(this.cityBaseCharges || {});
    
    for (const city of cities) {
      if (cityName.includes(city.toLowerCase())) {
        return city;
      }
    }
    
    return null;
  }
}

// Create singleton instance
const pricingService = new PricingService();

export default pricingService;
