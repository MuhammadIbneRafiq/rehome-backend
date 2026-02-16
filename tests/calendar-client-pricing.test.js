/**
 * Calendar Client-Side Pricing Test Suite
 *
 * Tests that the frontend calc* functions in UnifiedPricingCalendar.tsx
 * produce IDENTICAL results to basePriceCalculator.js.
 *
 * We re-implement the frontend functions here (they are pure JS) and compare
 * against the shared backend calculator to catch any drift.
 *
 * City charges (from city_base_charges table):
 *   Amsterdam: cheap (city_day) = 39, standard (normal) = 119
 *   Eindhoven: cheap (city_day) = 34, standard (normal) = 89
 */

import {
  calculateHouseMovingFixedPrice,
  calculateItemTransportSameDatePrice,
  calculateItemTransportDiffDatesPrice,
  calculateFlexiblePrice
} from '../services/pricing/basePriceCalculator.js';

// ─── Frontend calc functions (mirrors UnifiedPricingCalendar.tsx) ────────────

function calcHouseMovingFixed(d, c) {
  if (d.isBlocked) return 0;
  if (!c.isIntercity) {
    if (d.pickupScheduled) return c.pickupCheap;
    if (d.isEmpty) return c.pickupStandard * 0.75;
    return c.pickupStandard;
  }
  if (d.pickupScheduled && d.dropoffScheduled) return (c.pickupCheap + c.dropoffCheap) / 2;
  if (d.pickupScheduled) return (c.pickupCheap + c.dropoffStandard) / 2;
  if (d.dropoffScheduled) return (c.pickupStandard + c.dropoffCheap) / 2;
  if (d.isEmpty) return Math.max(c.pickupStandard, c.dropoffStandard) * 0.75;
  return Math.max(c.pickupStandard, c.dropoffStandard);
}

function calcItemSameDate(d, c) {
  if (d.isBlocked) return 0;
  if (!c.isIntercity) {
    if (d.pickupScheduled) return c.pickupCheap;
    if (d.isEmpty) return c.pickupStandard * 0.75;
    return c.pickupStandard;
  }
  if (d.pickupScheduled && d.dropoffScheduled) return (c.pickupCheap + c.dropoffCheap) / 2;
  if (d.pickupScheduled || d.dropoffScheduled) {
    const cheap = d.pickupScheduled ? c.pickupCheap : c.dropoffCheap;
    const std = d.pickupScheduled ? c.dropoffStandard : c.pickupStandard;
    return (cheap + std) / 2;
  }
  if (d.isEmpty) return (c.pickupStandard + c.dropoffStandard) / 2;
  return Math.max(c.pickupStandard, c.dropoffStandard);
}

function calcItemDiffDates(pDay, dDay, c) {
  if (!c.isIntercity) {
    const pS = pDay.pickupScheduled, dS = dDay.pickupScheduled;
    if (pS && dS) return c.pickupCheap;
    if (pS || dS) return (c.pickupCheap + c.pickupStandard) / 2;
    if (pDay.isEmpty && dDay.isEmpty) return c.pickupStandard * 0.75;
    return c.pickupStandard;
  }
  const pS = pDay.pickupScheduled, dS = dDay.dropoffScheduled;
  if (pS && dS) return (c.pickupCheap + c.dropoffCheap) / 2;
  if (pS || dS) {
    const cheap = pS ? c.pickupCheap : c.dropoffCheap;
    const std = pS ? c.dropoffStandard : c.pickupStandard;
    return (cheap + std) / 2;
  }
  if (pDay.isEmpty && dDay.isEmpty) return (c.pickupStandard + c.dropoffStandard) / 2;
  return Math.max(c.pickupStandard, c.dropoffStandard);
}

// ─── Shared test data ─────────────────────────────────────────────────────────

const AMS = { cheap: 39, standard: 119 };
const EIN = { cheap: 34, standard: 89 };

const sameCityCharges = {
  isIntercity: false,
  pickupCheap: AMS.cheap,
  pickupStandard: AMS.standard,
  dropoffCheap: AMS.cheap,
  dropoffStandard: AMS.standard
};

const intercityCharges = {
  isIntercity: true,
  pickupCheap: AMS.cheap,
  pickupStandard: AMS.standard,
  dropoffCheap: EIN.cheap,
  dropoffStandard: EIN.standard
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HOUSE MOVING — Frontend vs Backend parity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Frontend vs Backend — House Moving Fixed', () => {
  const scenarios = [
    { name: 'Same city, scheduled', charges: sameCityCharges, status: { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Same city, empty', charges: sameCityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false } },
    { name: 'Same city, not included', charges: sameCityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
    { name: 'Same city, blocked', charges: sameCityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: true } },
    { name: 'Intercity, both scheduled', charges: intercityCharges, status: { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, pickup only', charges: intercityCharges, status: { pickupScheduled: true, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, dropoff only', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, empty', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false } },
    { name: 'Intercity, neither', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
  ];

  scenarios.forEach(({ name, charges, status }) => {
    test(`${name}: frontend === backend`, () => {
      const frontend = calcHouseMovingFixed(status, charges);
      const backend = calculateHouseMovingFixedPrice({ ...charges, ...status });
      expect(frontend).toBe(backend.price);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ITEM TRANSPORT SAME DATE — Frontend vs Backend parity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Frontend vs Backend — Item Transport Same Date', () => {
  const scenarios = [
    { name: 'Same city, scheduled', charges: sameCityCharges, status: { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Same city, empty', charges: sameCityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false } },
    { name: 'Same city, not included', charges: sameCityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, both scheduled', charges: intercityCharges, status: { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, pickup only', charges: intercityCharges, status: { pickupScheduled: true, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, dropoff only', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: true, isEmpty: false, isBlocked: false } },
    { name: 'Intercity, empty', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false } },
    { name: 'Intercity, neither', charges: intercityCharges, status: { pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false } },
  ];

  scenarios.forEach(({ name, charges, status }) => {
    test(`${name}: frontend === backend`, () => {
      const frontend = calcItemSameDate(status, charges);
      const backend = calculateItemTransportSameDatePrice({ ...charges, ...status });
      expect(frontend).toBe(backend.price);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ITEM TRANSPORT DIFFERENT DATES — Frontend vs Backend parity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Frontend vs Backend — Item Transport Different Dates', () => {
  const withinCity = [
    { name: 'Both scheduled', pDay: { pickupScheduled: true, isEmpty: false }, dDay: { pickupScheduled: true, isEmpty: false }, charges: sameCityCharges },
    { name: 'Pickup only', pDay: { pickupScheduled: true, isEmpty: false }, dDay: { pickupScheduled: false, isEmpty: false }, charges: sameCityCharges },
    { name: 'Dropoff only', pDay: { pickupScheduled: false, isEmpty: false }, dDay: { pickupScheduled: true, isEmpty: false }, charges: sameCityCharges },
    { name: 'Both empty', pDay: { pickupScheduled: false, isEmpty: true }, dDay: { pickupScheduled: false, isEmpty: true }, charges: sameCityCharges },
    { name: 'Neither', pDay: { pickupScheduled: false, isEmpty: false }, dDay: { pickupScheduled: false, isEmpty: false }, charges: sameCityCharges },
  ];

  withinCity.forEach(({ name, pDay, dDay, charges }) => {
    test(`Within city, ${name}: frontend === backend`, () => {
      const frontend = calcItemDiffDates(pDay, dDay, charges);
      const backend = calculateItemTransportDiffDatesPrice({
        ...charges,
        pickupScheduledOnPickupDate: pDay.pickupScheduled,
        dropoffScheduledOnDropoffDate: dDay.pickupScheduled, // within city: same city on dropoff
        pickupDateEmpty: pDay.isEmpty,
        dropoffDateEmpty: dDay.isEmpty
      });
      expect(frontend).toBe(backend.price);
    });
  });

  const intercity = [
    { name: 'Both scheduled', pDay: { pickupScheduled: true, isEmpty: false }, dDay: { dropoffScheduled: true, isEmpty: false }, charges: intercityCharges },
    { name: 'Pickup only', pDay: { pickupScheduled: true, isEmpty: false }, dDay: { dropoffScheduled: false, isEmpty: false }, charges: intercityCharges },
    { name: 'Dropoff only', pDay: { pickupScheduled: false, isEmpty: false }, dDay: { dropoffScheduled: true, isEmpty: false }, charges: intercityCharges },
    { name: 'Both empty', pDay: { pickupScheduled: false, isEmpty: true }, dDay: { dropoffScheduled: false, isEmpty: true }, charges: intercityCharges },
    { name: 'Neither', pDay: { pickupScheduled: false, isEmpty: false }, dDay: { dropoffScheduled: false, isEmpty: false }, charges: intercityCharges },
  ];

  intercity.forEach(({ name, pDay, dDay, charges }) => {
    test(`Intercity, ${name}: frontend === backend`, () => {
      const frontend = calcItemDiffDates(pDay, dDay, charges);
      const backend = calculateItemTransportDiffDatesPrice({
        ...charges,
        pickupScheduledOnPickupDate: pDay.pickupScheduled,
        dropoffScheduledOnDropoffDate: dDay.dropoffScheduled,
        pickupDateEmpty: pDay.isEmpty,
        dropoffDateEmpty: dDay.isEmpty
      });
      expect(frontend).toBe(backend.price);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FLEXIBLE END-DATE CALCULATION — Frontend logic
// ═══════════════════════════════════════════════════════════════════════════════

describe('Frontend — calcFlexibleForEndDate vs basePriceCalculator', () => {
  // Re-implement calcFlexibleForEndDate from UnifiedPricingCalendar.tsx
  function calcFlexibleForEndDate(startStr, endStr, rawDays, c) {
    const rangeDays = Math.ceil((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000) + 1;
    if (rangeDays > 7) return c.pickupCheap;
    let pickupAvail = false, bothSameDate = false;
    const cur = new Date(startStr);
    const last = new Date(endStr);
    while (cur <= last) {
      const ds = cur.toISOString().split('T')[0];
      const st = rawDays.get(ds);
      if (st?.pickupScheduled) { pickupAvail = true; if (c.isIntercity && st.dropoffScheduled) bothSameDate = true; }
      cur.setDate(cur.getDate() + 1);
    }
    if (!c.isIntercity) return pickupAvail ? c.pickupCheap : c.pickupStandard;
    return bothSameDate ? (c.pickupCheap + c.dropoffCheap) / 2 : c.pickupStandard;
  }

  test('Range > 7 days → cheap (within city)', () => {
    const rawDays = new Map();
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-10', rawDays, sameCityCharges);
    expect(price).toBe(AMS.cheap);
  });

  test('Range ≤ 7, city available → cheap (within city)', () => {
    const rawDays = new Map();
    rawDays.set('2025-02-03', { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false });
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-05', rawDays, sameCityCharges);
    expect(price).toBe(AMS.cheap);
  });

  test('Range ≤ 7, city NOT available → standard (within city)', () => {
    const rawDays = new Map();
    rawDays.set('2025-02-03', { pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false });
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-05', rawDays, sameCityCharges);
    expect(price).toBe(AMS.standard);
  });

  test('Range > 7 days → cheap (intercity)', () => {
    const rawDays = new Map();
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-10', rawDays, intercityCharges);
    expect(price).toBe(AMS.cheap);
  });

  test('Range ≤ 7, both cities on same date → avg cheap (intercity)', () => {
    const rawDays = new Map();
    rawDays.set('2025-02-03', { pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false });
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-05', rawDays, intercityCharges);
    expect(price).toBe((AMS.cheap + EIN.cheap) / 2);
  });

  test('Range ≤ 7, cities NOT on same date → standard (intercity)', () => {
    const rawDays = new Map();
    rawDays.set('2025-02-02', { pickupScheduled: true, dropoffScheduled: false, isEmpty: false, isBlocked: false });
    rawDays.set('2025-02-04', { pickupScheduled: false, dropoffScheduled: true, isEmpty: false, isBlocked: false });
    const price = calcFlexibleForEndDate('2025-02-01', '2025-02-05', rawDays, intercityCharges);
    expect(price).toBe(AMS.standard);
  });

  // Cross-check: frontend flexible vs backend flexible for >7 days
  test('Parity check: >7 days frontend === backend', () => {
    const frontendPrice = calcFlexibleForEndDate('2025-02-01', '2025-02-10', new Map(), sameCityCharges);
    const backendResult = calculateFlexiblePrice({
      ...sameCityCharges,
      rangeDays: 10,
      pickupAvailableInRange: false,
      dropoffAvailableInRange: false,
      bothAvailableSameDate: false
    });
    expect(frontendPrice).toBe(backendResult.price);
  });
});
