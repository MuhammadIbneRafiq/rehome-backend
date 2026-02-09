/**
 * Shared Base Price Calculator
 * 
 * Centralized pricing logic used by both:
 * - calendar-pricing.js (calendar display)
 * - supabasePricingService.js (order pricing)
 * 
 * Rules Reference:
 * - cheap base charge = city scheduled in admin calendar
 * - standard base charge = city NOT scheduled but NOT blocked
 * - empty day charge = 75% of cheapest (house moving) or 75% of standard (item transport)
 * - blocked = no booking possible
 */

/**
 * Calculate base price for FIXED date - House Moving
 * 
 * @param {Object} params
 * @param {boolean} params.isIntercity - Whether pickup and dropoff are in different cities
 * @param {boolean} params.pickupScheduled - Whether pickup city is scheduled on the date
 * @param {boolean} params.dropoffScheduled - Whether dropoff city is scheduled on the date
 * @param {boolean} params.isEmpty - Whether no cities are scheduled on the date
 * @param {boolean} params.isBlocked - Whether the date is blocked
 * @param {number} params.pickupCheap - Cheap base charge for pickup city
 * @param {number} params.pickupStandard - Standard base charge for pickup city
 * @param {number} params.dropoffCheap - Cheap base charge for dropoff city
 * @param {number} params.dropoffStandard - Standard base charge for dropoff city
 * @returns {{ price: number, type: string }}
 */
export function calculateHouseMovingFixedPrice({
  isIntercity,
  pickupScheduled,
  dropoffScheduled,
  isEmpty,
  isBlocked,
  pickupCheap,
  pickupStandard,
  dropoffCheap,
  dropoffStandard
}) {
  if (isBlocked) return { price: 0, type: 'blocked' };

  if (!isIntercity) {
    // Within City
    if (pickupScheduled) {
      return { price: pickupCheap, type: 'City Day Rate - Scheduled' };
    } else if (isEmpty) {
      return { price: pickupCheap * 0.75, type: 'Empty Day - 75% Cheapest' };
    } else {
      return { price: pickupStandard, type: 'Standard Rate' };
    }
  } else {
    // Between Cities
    if (pickupScheduled && dropoffScheduled) {
      return { price: (pickupCheap + dropoffCheap) / 2, type: 'Intercity - Both Scheduled' };
    } else if (pickupScheduled && !dropoffScheduled) {
      return { price: (pickupCheap + dropoffStandard) / 2, type: 'Intercity - Pickup Scheduled' };
    } else if (!pickupScheduled && dropoffScheduled) {
      return { price: (pickupStandard + dropoffCheap) / 2, type: 'Intercity - Dropoff Scheduled' };
    } else if (isEmpty) {
      return { price: Math.max(pickupStandard, dropoffStandard) * 0.75, type: 'Intercity Empty Day - 75% Higher Standard' };
    } else {
      return { price: Math.max(pickupStandard, dropoffStandard), type: 'Intercity - Higher Standard Rate' };
    }
  }
}

/**
 * Calculate base price for FIXED date - Item Transport, Same Date
 * 
 * @param {Object} params - Same shape as calculateHouseMovingFixedPrice
 * @returns {{ price: number, type: string }}
 */
export function calculateItemTransportSameDatePrice({
  isIntercity,
  pickupScheduled,
  dropoffScheduled,
  isEmpty,
  isBlocked,
  pickupCheap,
  pickupStandard,
  dropoffCheap,
  dropoffStandard
}) {
  if (isBlocked) return { price: 0, type: 'blocked' };

  if (!isIntercity) {
    // Within city, same date — same rules as house moving within city
    if (pickupScheduled) {
      return { price: pickupCheap, type: 'Same City/Date - Scheduled' };
    } else if (isEmpty) {
      return { price: pickupStandard * 0.75, type: 'Same City/Date - Empty (75%)' };
    } else {
      return { price: pickupStandard, type: 'Same City/Date - Standard' };
    }
  } else {
    // Between cities, same date
    if (pickupScheduled && dropoffScheduled) {
      return { price: (pickupCheap + dropoffCheap) / 2, type: 'Intercity/Same Date - Both Scheduled' };
    } else if ((pickupScheduled && !dropoffScheduled) || (!pickupScheduled && dropoffScheduled)) {
      const includedCheap = pickupScheduled ? pickupCheap : dropoffCheap;
      const notIncludedStandard = pickupScheduled ? dropoffStandard : pickupStandard;
      return { price: (includedCheap + notIncludedStandard) / 2, type: 'Intercity/Same Date - One Scheduled' };
    } else if (isEmpty) {
      // Item transport: (standard_pickup + standard_dropoff) / 2
      return { price: (pickupStandard + dropoffStandard) / 2, type: 'Intercity/Same Date - Empty' };
    } else {
      return { price: Math.max(pickupStandard, dropoffStandard), type: 'Intercity/Same Date - Higher Standard' };
    }
  }
}

/**
 * Calculate base price for FIXED date - Item Transport, Different Dates
 * 
 * @param {Object} params
 * @param {boolean} params.isIntercity
 * @param {boolean} params.pickupScheduledOnPickupDate - Is pickup city scheduled on the pickup date
 * @param {boolean} params.dropoffScheduledOnDropoffDate - Is dropoff city scheduled on the dropoff date (for intercity)
 * @param {boolean} params.pickupDateEmpty - Is the pickup date empty (no cities scheduled)
 * @param {boolean} params.dropoffDateEmpty - Is the dropoff date empty (no cities scheduled)
 * @param {number} params.pickupCheap
 * @param {number} params.pickupStandard
 * @param {number} params.dropoffCheap
 * @param {number} params.dropoffStandard
 * @returns {{ price: number, type: string }}
 */
export function calculateItemTransportDiffDatesPrice({
  isIntercity,
  pickupScheduledOnPickupDate,
  dropoffScheduledOnDropoffDate,
  pickupDateEmpty,
  dropoffDateEmpty,
  pickupCheap,
  pickupStandard,
  dropoffCheap,
  dropoffStandard
}) {
  if (!isIntercity) {
    // Within city, different dates
    // For within-city: pickup city = dropoff city, so we check pickupScheduled on each date
    const bothScheduled = pickupScheduledOnPickupDate && dropoffScheduledOnDropoffDate;
    const bothEmpty = pickupDateEmpty && dropoffDateEmpty;
    const oneScheduled = (pickupScheduledOnPickupDate || dropoffScheduledOnDropoffDate) && !bothScheduled;

    if (bothScheduled) {
      return { price: pickupCheap, type: 'Same City/Diff Dates - Both Scheduled' };
    } else if (oneScheduled) {
      // "regardless of other day empty or not included"
      return { price: (pickupCheap + pickupStandard) / 2, type: 'Same City/Diff Dates - One Scheduled' };
    } else if (bothEmpty) {
      return { price: pickupStandard * 0.75, type: 'Same City/Diff Dates - Both Empty (75%)' };
    } else {
      return { price: pickupStandard, type: 'Same City/Diff Dates - Standard' };
    }
  } else {
    // Between cities, different dates
    const bothScheduled = pickupScheduledOnPickupDate && dropoffScheduledOnDropoffDate;
    const bothEmpty = pickupDateEmpty && dropoffDateEmpty;
    const oneScheduled = (pickupScheduledOnPickupDate || dropoffScheduledOnDropoffDate) && !bothScheduled;

    if (bothScheduled) {
      return { price: (pickupCheap + dropoffCheap) / 2, type: 'Intercity/Diff Dates - Both Scheduled' };
    } else if (oneScheduled) {
      // "regardless of other city day being empty or not included"
      const includedCheap = pickupScheduledOnPickupDate ? pickupCheap : dropoffCheap;
      const notIncludedStandard = pickupScheduledOnPickupDate ? dropoffStandard : pickupStandard;
      return { price: (includedCheap + notIncludedStandard) / 2, type: 'Intercity/Diff Dates - One Scheduled' };
    } else if (bothEmpty) {
      return { price: (pickupStandard + dropoffStandard) / 2, type: 'Intercity/Diff Dates - Both Empty' };
    } else {
      return { price: Math.max(pickupStandard, dropoffStandard), type: 'Intercity/Diff Dates - Higher Standard' };
    }
  }
}

/**
 * Calculate base price for FLEXIBLE date range
 * 
 * @param {Object} params
 * @param {boolean} params.isIntercity
 * @param {number} params.rangeDays - Number of days in range
 * @param {boolean} params.pickupAvailableInRange - Whether pickup city is scheduled on any date in range
 * @param {boolean} params.dropoffAvailableInRange - Whether dropoff city is scheduled on any date in range
 * @param {boolean} params.bothAvailableSameDate - Whether both cities are scheduled on the SAME date in range
 * @param {number} params.pickupCheap
 * @param {number} params.pickupStandard
 * @param {number} params.dropoffCheap
 * @param {number} params.dropoffStandard
 * @returns {{ price: number, type: string }}
 */
export function calculateFlexiblePrice({
  isIntercity,
  rangeDays,
  pickupAvailableInRange,
  dropoffAvailableInRange,
  bothAvailableSameDate,
  pickupCheap,
  pickupStandard,
  dropoffCheap,
  dropoffStandard
}) {
  if (rangeDays > 7) {
    // Above one week: always cheap base charge for pickup city
    return { price: pickupCheap, type: 'Flexible Range >7 days - Cheap Rate' };
  }

  // Below one week
  if (!isIntercity) {
    // Within city
    if (pickupAvailableInRange) {
      return { price: pickupCheap, type: 'Flexible Range - City Available' };
    } else {
      // Not available (even if empty date in range) = standard
      return { price: pickupStandard, type: 'Flexible Range - City Not Available' };
    }
  } else {
    // Between cities
    if (bothAvailableSameDate) {
      return { price: (pickupCheap + dropoffCheap) / 2, type: 'Flexible Range - Both Cities Same Date' };
    } else {
      return { price: pickupStandard, type: 'Flexible Range - Standard Pickup' };
    }
  }
}

/**
 * Calculate base price for REHOME option
 * Always cheapest base charge for the pickup city
 * 
 * @param {Object} params
 * @param {number} params.pickupCheap
 * @returns {{ price: number, type: string }}
 */
export function calculateRehomePrice({ pickupCheap }) {
  return { price: pickupCheap, type: 'ReHome Choose - Cheapest Rate' };
}
