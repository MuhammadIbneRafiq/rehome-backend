/**
 * Base Price Calculation Test Suite
 * 
 * Tests all base charge scenarios against the pricing rules:
 * - Fixed Date (House Moving & Item Transport)
 * - Flexible Date Range
 * - ReHome Option
 * 
 * Uses mock city charges:
 *   Amsterdam: cheap=25, standard=35
 *   Eindhoven: cheap=20, standard=30
 */

import {
  calculateHouseMovingFixedPrice,
  calculateItemTransportSameDatePrice,
  calculateItemTransportDiffDatesPrice,
  calculateFlexiblePrice,
  calculateRehomePrice
} from '../services/pricing/basePriceCalculator.js';

// ─── Mock City Charges ───────────────────────────────────────────────────────
const AMS = { cheap: 25, standard: 35 };   // Amsterdam
const EIN = { cheap: 20, standard: 30 };   // Eindhoven

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
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Empty day → 75% of cheapest base charge', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(AMS.cheap * 0.75); // 18.75
  });

  test('City not included → standard base charge', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 35
  });

  test('Blocked date → 0', () => {
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
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // 22.5
  });

  test('Pickup included, dropoff not → (cheap_pickup + standard_dropoff) / 2', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // 27.5
  });

  test('Dropoff included, pickup not → (standard_pickup + cheap_dropoff) / 2', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.standard + EIN.cheap) / 2); // 27.5
  });

  test('Empty day → 75% of higher standard charge', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard) * 0.75); // 26.25
  });

  test('Neither city included → higher standard base charge', () => {
    const result = calculateHouseMovingFixedPrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 35
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
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('City not included → standard base charge', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 35
  });

  test('Empty day → 75% of standard charge', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    expect(result.price).toBe(AMS.standard * 0.75); // 26.25
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
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // 22.5
  });

  test('Only pickup included → (cheap_pickup + standard_dropoff) / 2', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: true,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // 27.5
  });

  test('Only dropoff included → (cheap_dropoff + standard_pickup) / 2', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: true,
      isEmpty: false
    });
    expect(result.price).toBe((EIN.cheap + AMS.standard) / 2); // 27.5
  });

  test('Empty day → (standard_pickup + standard_dropoff) / 2', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: true
    });
    // Item transport differs from house moving here!
    expect(result.price).toBe((AMS.standard + EIN.standard) / 2); // 32.5
  });

  test('Neither included → higher standard base charge', () => {
    const result = calculateItemTransportSameDatePrice({
      ...base,
      pickupScheduled: false,
      dropoffScheduled: false,
      isEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 35
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
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Both dates empty → 75% of standard charge', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: true
    });
    expect(result.price).toBe(AMS.standard * 0.75); // 26.25
  });

  test('City included on only pickup date (dropoff not included) → (cheap + standard) / 2', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // 30
  });

  test('City included on only dropoff date (pickup not included) → (cheap + standard) / 2', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // 30
  });

  test('City included on pickup, dropoff day is EMPTY → (cheap + standard) / 2 (regardless)', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: true  // empty, but rule says "regardless"
    });
    expect(result.price).toBe((AMS.cheap + AMS.standard) / 2); // 30
  });

  test('Neither date has city included → standard base charge', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 35
  });

  test('Pickup empty, dropoff not included → standard base charge', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(AMS.standard); // 35
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
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // 22.5
  });

  test('Neither city included → higher standard base charge', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 35
  });

  test('Only pickup included (dropoff not included) → (cheap_pickup + standard_dropoff) / 2', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // 27.5
  });

  test('Only dropoff included (pickup not included) → (cheap_dropoff + standard_pickup) / 2', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: true,
      pickupDateEmpty: false,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe((EIN.cheap + AMS.standard) / 2); // 27.5
  });

  test('Only pickup included, dropoff day empty → (cheap_pickup + standard_dropoff) / 2 (regardless)', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: true,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: false,
      dropoffDateEmpty: true // empty, rule: "regardless"
    });
    expect(result.price).toBe((AMS.cheap + EIN.standard) / 2); // 27.5
  });

  test('Both days empty → (standard_pickup + standard_dropoff) / 2', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: true
    });
    expect(result.price).toBe((AMS.standard + EIN.standard) / 2); // 32.5
  });

  test('One day empty, one not included → higher standard', () => {
    const result = calculateItemTransportDiffDatesPrice({
      ...base,
      pickupScheduledOnPickupDate: false,
      dropoffScheduledOnDropoffDate: false,
      pickupDateEmpty: true,
      dropoffDateEmpty: false
    });
    expect(result.price).toBe(Math.max(AMS.standard, EIN.standard)); // 35
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
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Range ≤ 7, city available → cheap base charge', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true
    });
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Range ≤ 7, city NOT available (even if empty) → standard base charge', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: false
    });
    expect(result.price).toBe(AMS.standard); // 35
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
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Range ≤ 7, both cities on same date → (cheap_pickup + cheap_dropoff) / 2', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true,
      dropoffAvailableInRange: true,
      bothAvailableSameDate: true
    });
    expect(result.price).toBe((AMS.cheap + EIN.cheap) / 2); // 22.5
  });

  test('Range ≤ 7, cities NOT on same date → standard base charge pickup', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 5,
      pickupAvailableInRange: true,
      dropoffAvailableInRange: true,
      bothAvailableSameDate: false
    });
    expect(result.price).toBe(AMS.standard); // 35
  });

  test('Range ≤ 7, neither available → standard base charge pickup', () => {
    const result = calculateFlexiblePrice({
      ...base,
      rangeDays: 3,
      pickupAvailableInRange: false,
      dropoffAvailableInRange: false,
      bothAvailableSameDate: false
    });
    expect(result.price).toBe(AMS.standard); // 35
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REHOME OPTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReHome Can Suggest', () => {
  test('Always cheapest base charge for pickup city', () => {
    const result = calculateRehomePrice({ pickupCheap: AMS.cheap });
    expect(result.price).toBe(AMS.cheap); // 25
  });

  test('Different city still uses pickup cheap', () => {
    const result = calculateRehomePrice({ pickupCheap: EIN.cheap });
    expect(result.price).toBe(EIN.cheap); // 20
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
    expect(hm.price).toBe(Math.max(AMS.standard, EIN.standard) * 0.75); // 26.25
  });

  test('Item transport intercity same date empty → (standard_p + standard_d) / 2', () => {
    const it = calculateItemTransportSameDatePrice(charges);
    expect(it.price).toBe((AMS.standard + EIN.standard) / 2); // 32.5
  });

  test('The two are NOT equal', () => {
    const hm = calculateHouseMovingFixedPrice(charges);
    const it = calculateItemTransportSameDatePrice(charges);
    expect(hm.price).not.toBe(it.price);
  });
});
