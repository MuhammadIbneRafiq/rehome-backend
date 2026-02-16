/**
 * Base Price Calculation Test Suite
 * 
 * Tests all base charge scenarios against the pricing rules:
 * - Fixed Date (House Moving & Item Transport)
 * - Flexible Date Range
 * - ReHome Option
 * 
 * Uses real city charges from city_base_charges table:
 *   Amsterdam: cheap (city_day) = 39, standard (normal) = 119
 *   Eindhoven: cheap (city_day) = 34, standard (normal) = 89
 *
 * Mock schedule data assumptions:
 *   - "scheduled" means the city IS in city_schedules for that date
 *   - "empty" means NO cities at all are in city_schedules for that date
 *   - "not included" means the city is NOT scheduled but other cities may be
 *   - "blocked" means the date is in blocked_dates
 */

import {
  calculateHouseMovingFixedPrice,
  calculateItemTransportSameDatePrice,
  calculateItemTransportDiffDatesPrice,
  calculateFlexiblePrice,
  calculateRehomePrice
} from '../services/pricing/basePriceCalculator.js';

// ─── Mock City Charges (from city_base_charges table) ────────────────────────
const AMS = { cheap: 39, standard: 119 };  // Amsterdam: city_day=39, normal=119
const EIN = { cheap: 34, standard: 89 };   // Eindhoven: city_day=34, normal=89

// ═══════════════════════════════════════════════════════════════════════════════
//  FIXED DATE — HOUSE MOVING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixed Date — House Moving — Within City', () => {
  const base = {
    isIntercity: false,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: AMS.cheap,
    dropoffStandard: AMS.standard,
    isBlocked: false
  };

  test('City included in calendar → cheap base charge', () => {
    // e.g. Amsterdam scheduled on this date
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Empty day → 75% of standard base charge', () => {
    // No cities scheduled at all on this date
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(AMS.standard * 0.75); // 89.25
    expect(result.type).toBe('Empty Day - 75% Standard');
  });

  test('City not included → standard base charge', () => {
    // Other cities scheduled, but not Amsterdam
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });

  test('Blocked date → 0', () => {
    // Date is in blocked_dates table
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false,
      isBlocked: true
    });
    expect(result.price).toBe(0);
    expect(result.type).toBe('blocked');
  });
});

describe('Fixed Date — House Moving — Between Cities', () => {
  const base = {
    isIntercity: true,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: EIN.cheap,
    dropoffStandard: EIN.standard,
    isBlocked: false
  };

  test('Both cities included → (cheap_pickup + cheap_dropoff) / 2', () => {
    // e.g. Both Amsterdam and Eindhoven in city_schedules for this date
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // (39+34)/2 = 36.5
  });

  test('Pickup included, dropoff not → (cheap_pickup + standard_dropoff) / 2', () => {
    // Amsterdam scheduled, Eindhoven NOT scheduled (other cities may be)
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // (39+89)/2 = 64
  });

  test('Dropoff included, pickup not → (standard_pickup + cheap_dropoff) / 2', () => {
    // Eindhoven scheduled, Amsterdam NOT scheduled
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.standard + EIN.cheap) / 2); // (119+34)/2 = 76.5
  });

  test('Empty day → 75% of higher standard charge', () => {
    // No cities scheduled at all
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard) * 0.75); // 119*0.75 = 89.25
  });

  test('Neither city included → higher standard base charge', () => {
    // Other cities scheduled, but neither Amsterdam nor Eindhoven
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 119
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FIXED DATE — ITEM TRANSPORT — SAME DATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixed Date — Item Transport — Within City, Same Date', () => {
  const base = {
    isIntercity: false,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: AMS.cheap,
    dropoffStandard: AMS.standard,
    isBlocked: false
  };

  test('City included → cheap base charge', () => {
    // Amsterdam scheduled on this date
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('City not included → standard base charge', () => {
    // Other cities scheduled, but not Amsterdam
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });

  test('Empty day → 75% of standard charge', () => {
    // No cities scheduled at all
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(AMS.standard * 0.75); // 89.25
  });
});

describe('Fixed Date — Item Transport — Between Cities, Same Date', () => {
  const base = {
    isIntercity: true,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: EIN.cheap,
    dropoffStandard: EIN.standard,
    isBlocked: false
  };

  test('Both cities included → (cheap_pickup + cheap_dropoff) / 2', () => {
    // Both Amsterdam and Eindhoven scheduled on same date
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // (39+34)/2 = 36.5
  });

  test('Only pickup included → (cheap_pickup + standard_dropoff) / 2', () => {
    // Amsterdam scheduled, Eindhoven NOT scheduled
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // (39+89)/2 = 64
  });

  test('Only dropoff included → (cheap_dropoff + standard_pickup) / 2', () => {
    // Eindhoven scheduled, Amsterdam NOT scheduled
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((EIN.cheap + AMS.standard) / 2); // (34+119)/2 = 76.5
  });

  test('Empty day → (standard_pickup + standard_dropoff) / 2', () => {
    // No cities scheduled at all — item transport averages both standards
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe((AMS.standard + EIN.standard) / 2); // (119+89)/2 = 104
  });

  test('Neither included → higher standard base charge', () => {
    // Other cities scheduled, but neither Amsterdam nor Eindhoven
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 119
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FIXED DATE — ITEM TRANSPORT — DIFFERENT DATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixed Date — Item Transport — Within City, Different Dates', () => {
  const base = {
    isIntercity: false,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: AMS.cheap,
    dropoffStandard: AMS.standard
  };

  test('City included on both dates → cheap base charge', () => {
    // Amsterdam scheduled on pickup date AND on dropoff date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Both dates empty → 75% of standard charge', () => {
    // No cities scheduled on either date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: true
    });
    expect(result.price).toBe(AMS.standard * 0.75); // 119*0.75 = 89.25
  });

  test('City included on only pickup date (dropoff not included) → (cheap + standard) / 2', () => {
    // Amsterdam scheduled on pickup date, NOT on dropoff date (other cities may be)
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // (39+119)/2 = 79
  });

  test('City included on only dropoff date (pickup not included) → (cheap + standard) / 2', () => {
    // Amsterdam scheduled on dropoff date, NOT on pickup date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // (39+119)/2 = 79
  });

  test('City included on pickup, dropoff day is EMPTY → (cheap + standard) / 2 (regardless)', () => {
    // Amsterdam scheduled on pickup date, dropoff date is completely empty
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: true  // empty, but rule says "regardless"
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // (39+119)/2 = 79
  });

  test('Neither date has city included → standard base charge', () => {
    // Amsterdam NOT scheduled on either date, but dates are not empty (other cities are)
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });

  test('Pickup empty, dropoff not included → standard base charge', () => {
    // Pickup date has no cities, dropoff date has other cities but not Amsterdam
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });
});

describe('Fixed Date — Item Transport — Between Cities, Different Dates', () => {
  const base = {
    isIntercity: true,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: EIN.cheap,
    dropoffStandard: EIN.standard
  };

  test('Both cities included on their dates → (cheap_pickup + cheap_dropoff) / 2', () => {
    // Amsterdam scheduled on pickup date, Eindhoven scheduled on dropoff date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // (39+34)/2 = 36.5
  });

  test('Neither city included → higher standard base charge', () => {
    // Neither Amsterdam nor Eindhoven scheduled on their dates, other cities may be
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 119
  });

  test('Only pickup included (dropoff not included) → (cheap_pickup + standard_dropoff) / 2', () => {
    // Amsterdam scheduled on Feb 11 (city day), Eindhoven NOT scheduled on dropoff date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // (39+89)/2 = 64
  });

  test('Only dropoff included (pickup not included) → (cheap_dropoff + standard_pickup) / 2', () => {
    // Eindhoven scheduled on dropoff date, Amsterdam NOT on pickup date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((EIN.cheap + AMS.standard) / 2); // (34+119)/2 = 76.5
  });

  test('Only pickup included, dropoff day empty → (cheap_pickup + standard_dropoff) / 2 (regardless)', () => {
    // Amsterdam scheduled on pickup date, dropoff date is completely empty — rule: "regardless"
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: true // empty, rule: "regardless"
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // (39+89)/2 = 64
  });

  test('Both days empty → (standard_pickup + standard_dropoff) / 2', () => {
    // No cities scheduled on either date
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: true
    });
    expect(result.price).toBe((AMS.standard + EIN.standard) / 2); // (119+89)/2 = 104
  });

  test('One day empty, one not included → higher standard', () => {
    // Pickup date empty, dropoff date has other cities but not Eindhoven
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 119
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FLEXIBLE DATE RANGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Flexible Date Range — Within City', () => {
  const base = {
    isIntercity: false,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: AMS.cheap,
    dropoffStandard: AMS.standard,
    bothAvailableSameDate: false,
    dropoffAvailableInRange: false
  };

  test('Range > 7 days → cheap base charge for pickup city', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 10,
      pickupAvailableInRange: false
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Range ≤ 7, city available → cheap base charge', () => {
    // Amsterdam scheduled on at least one date in range
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Range ≤ 7, city NOT available (even if empty) → standard base charge', () => {
    // Amsterdam NOT scheduled on any date in range
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });
});

describe('Flexible Date Range — Between Cities', () => {
  const base = {
    isIntercity: true,
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: EIN.cheap,
    dropoffStandard: EIN.standard
  };

  test('Range > 7 days → cheap base charge for pickup city', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 14,
      pickupAvailableInRange: true,
      dropoffAvailableInRange: true,
      bothAvailableSameDate: true
    });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Range ≤ 7, both cities on same date → (cheap_pickup + cheap_dropoff) / 2', () => {
    // Both Amsterdam and Eindhoven scheduled on same date within range
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true,
      dropoffAvailableInRange: true,
      bothAvailableSameDate: true
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // (39+34)/2 = 36.5
  });

  test('Range ≤ 7, cities NOT on same date → standard base charge pickup', () => {
    // Both available but never on same date
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true,
      dropoffAvailableInRange: true,
      bothAvailableSameDate: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });

  test('Range ≤ 7, neither available → standard base charge pickup', () => {
    // Neither city scheduled in range at all
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 3,
      pickupAvailableInRange: false,
      dropoffAvailableInRange: false,
      bothAvailableSameDate: false
    });
    expect(result.price).toBe(AMS.standard); // 119
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REHOME OPTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReHome Can Suggest', () => {
  test('Always cheapest base charge for pickup city', () => {
    const result = calculateRehomePrice({ pickupCheap: AMS.cheap });
    expect(result.price).toBe(AMS.cheap); // 39
  });

  test('Different city still uses pickup cheap', () => {
    const result = calculateRehomePrice({ pickupCheap: EIN.cheap });
    expect(result.price).toBe(EIN.cheap); // 34
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CROSS-SERVICE COMPARISON (verify item transport ≠ house moving where needed)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-service: intercity empty day differs', () => {
  const charges = {
    pickupCheap: AMS.cheap,
    pickupStandard: AMS.standard,
    dropoffCheap: EIN.cheap,
    dropoffStandard: EIN.standard,
    isIntercity: true,
    isBlocked: false,
    pickupScheduled: false,
    dropoffScheduled: false,
    isEmpty: true
  };

  test('House moving intercity empty → 75% of higher standard', () => {
    const hm = calculateHouseMovingFixedPrice(charges);
    expect(hm.price).toBe(Math.max(AMS.standard, EIN.standard) * 0.75); // 119*0.75 = 89.25
  });

  test('Item transport intercity same date empty → (standard_p + standard_d) / 2', () => {
    const it = calculateItemTransportSameDatePrice(charges);
    expect(it.price).toBe((AMS.standard + EIN.standard) / 2); // (119+89)/2 = 104
  });

  test('The two are NOT equal', () => {
    const hm = calculateHouseMovingFixedPrice(charges);
    const it = calculateItemTransportSameDatePrice(charges);
    expect(hm.price).not.toBe(it.price);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REAL-WORLD SCENARIO: Amsterdam pickup → Eindhoven dropoff (intercity diff dates)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real scenario: Amsterdam → Eindhoven, pickup Feb 11 (scheduled), dropoff Feb 27 (empty)', () => {
  const base = {
    isIntercity: true,
    pickupCheap: AMS.cheap,     // 39
    pickupStandard: AMS.standard, // 119
    dropoffCheap: EIN.cheap,     // 34
    dropoffStandard: EIN.standard // 89
  };

  test('Pickup city scheduled on pickup date, dropoff date empty → (cheap_pickup + standard_dropoff) / 2 = 64', () => {
    // Feb 11: Amsterdam IS in city_schedules (city day)
    // Feb 27: No cities in city_schedules (empty day)
    // Rule: one city scheduled → (cheap_that_city + standard_other) / 2
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,   // Amsterdam scheduled on Feb 11
      dropoffScheduledOnDropoffDate: false, // Eindhoven NOT scheduled on Feb 27
      pickupDateEmpty: false,               // Feb 11 has cities (Amsterdam, Eindhoven, Tilburg)
      dropoffDateEmpty: true                // Feb 27 has no cities
    });
    expect(result.price).toBe(64); // (39 + 89) / 2 = 64
    expect(result.type).toContain('One Scheduled');
  });

  test('Both cities scheduled on their dates → (cheap_pickup + cheap_dropoff) / 2 = 36.5', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(36.5); // (39 + 34) / 2
  });

  test('Neither scheduled, neither empty → higher standard = 119', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(119); // max(119, 89)
  });

  test('Both dates empty → (standard_pickup + standard_dropoff) / 2 = 104', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: true
    });
    expect(result.price).toBe(104); // (119 + 89) / 2
  });
});
