/**
 * Color Coding Test Suite
 *
 * Tests the calendar color determination logic extracted from calendar-pricing.js.
 * Rules (from calendar_color_rules.md):
 *
 * Same City:
 *   green  = city IS scheduled
 *   orange = empty day (no cities scheduled)
 *   red    = city NOT scheduled but other cities are
 *   grey   = blocked
 *
 * Intercity:
 *   green  = BOTH cities scheduled
 *   orange = only ONE city scheduled OR empty day
 *   red    = neither city scheduled (not blocked)
 *   grey   = blocked (whole day or at least one city)
 */

// ─── Inline the pure color logic from calendar-pricing.js so tests stay unit-level ──

function determineColorCode(calendarStatus, isIntercity) {
  if (calendarStatus.isBlocked) return 'grey';
  if (!isIntercity) {
    if (calendarStatus.pickupScheduled) return 'green';
    if (calendarStatus.isEmpty) return 'orange';
    return 'red';
  }
  // Intercity
  if (calendarStatus.pickupScheduled && calendarStatus.dropoffScheduled) return 'green';
  if (calendarStatus.pickupScheduled || calendarStatus.dropoffScheduled || calendarStatus.isEmpty) return 'orange';
  return 'red';
}

// ─── Inline the blocked-check logic from getCalendarStatusFromPrefetch ──

function isDateBlocked(blockEntries, pickupCity, dropoffCity) {
  return blockEntries.some(entry => {
    if (!entry.cities || entry.cities.length === 0) return true;
    const lowerCities = entry.cities.map(c => c.toLowerCase());
    return lowerCities.includes(pickupCity.toLowerCase()) || lowerCities.includes(dropoffCity.toLowerCase());
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SAME CITY COLOR RULES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Color Coding — Same City', () => {
  const isIntercity = false;

  test('City scheduled → green', () => {
    expect(determineColorCode({
      pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('green');
  });

  test('Empty day (no cities at all) → orange', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false
    }, isIntercity)).toBe('orange');
  });

  test('City not scheduled but others are → red', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('red');
  });

  test('Blocked → grey', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: true
    }, isIntercity)).toBe('grey');
  });

  test('Blocked overrides scheduled → grey', () => {
    expect(determineColorCode({
      pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: true
    }, isIntercity)).toBe('grey');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERCITY COLOR RULES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Color Coding — Intercity', () => {
  const isIntercity = true;

  test('Both cities scheduled → green', () => {
    expect(determineColorCode({
      pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('green');
  });

  test('Only pickup scheduled → orange', () => {
    expect(determineColorCode({
      pickupScheduled: true, dropoffScheduled: false, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('orange');
  });

  test('Only dropoff scheduled → orange', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: true, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('orange');
  });

  test('Empty day → orange', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: true, isBlocked: false
    }, isIntercity)).toBe('orange');
  });

  test('Neither city scheduled (others are) → red', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: false
    }, isIntercity)).toBe('red');
  });

  test('Blocked → grey', () => {
    expect(determineColorCode({
      pickupScheduled: false, dropoffScheduled: false, isEmpty: false, isBlocked: true
    }, isIntercity)).toBe('grey');
  });

  test('Blocked overrides both scheduled → grey', () => {
    expect(determineColorCode({
      pickupScheduled: true, dropoffScheduled: true, isEmpty: false, isBlocked: true
    }, isIntercity)).toBe('grey');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PER-CITY BLOCKED DATE LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

describe('Blocked Date — Per-City Logic', () => {
  test('Full day block (empty cities array) → blocked for ANY city pair', () => {
    const entries = [{ cities: [] }];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(true);
    expect(isDateBlocked(entries, 'Rotterdam', 'Utrecht')).toBe(true);
  });

  test('City-specific block covers pickup city → blocked', () => {
    const entries = [{ cities: ['Amsterdam'] }];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(true);
  });

  test('City-specific block covers dropoff city → blocked', () => {
    const entries = [{ cities: ['Eindhoven'] }];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(true);
  });

  test('City-specific block does NOT cover either city → NOT blocked', () => {
    const entries = [{ cities: ['Rotterdam'] }];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(false);
  });

  test('No block entries → NOT blocked', () => {
    expect(isDateBlocked([], 'Amsterdam', 'Eindhoven')).toBe(false);
  });

  test('Multiple entries, one covers pickup → blocked', () => {
    const entries = [
      { cities: ['Rotterdam'] },
      { cities: ['Amsterdam', 'Utrecht'] }
    ];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(true);
  });

  test('Case-insensitive city matching', () => {
    const entries = [{ cities: ['amsterdam'] }];
    expect(isDateBlocked(entries, 'Amsterdam', 'Eindhoven')).toBe(true);
  });
});
