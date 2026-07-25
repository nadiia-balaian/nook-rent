import { describe, expect, it } from 'vitest';

import { DomainValidationError, LocalDate, StayRange } from '../src/index.js';

describe('LocalDate', () => {
  it('accepts real calendar dates and rejects rolled dates', () => {
    expect(LocalDate.parse('2028-02-29').toString()).toBe('2028-02-29');
    expect(() => LocalDate.parse('2027-02-29')).toThrow(DomainValidationError);
    expect(() => LocalDate.parse('25-07-2026')).toThrow(DomainValidationError);
  });
});

describe('StayRange', () => {
  it('accepts the 3-night minimum and 90-night maximum', () => {
    expect(
      StayRange.fromStrings({
        checkIn: '2026-08-01',
        checkOut: '2026-08-04',
      }).nights,
    ).toBe(3);

    expect(
      StayRange.fromStrings({
        checkIn: '2026-08-01',
        checkOut: '2026-10-30',
      }).nights,
    ).toBe(90);
  });

  it('rejects stays outside the product limits', () => {
    expect(() =>
      StayRange.fromStrings({
        checkIn: '2026-08-01',
        checkOut: '2026-08-03',
      }),
    ).toThrow('stay must be at least 3 nights');

    expect(() =>
      StayRange.fromStrings({
        checkIn: '2026-08-01',
        checkOut: '2026-10-31',
      }),
    ).toThrow('stay cannot exceed 90 nights');
  });

  it('uses half-open ranges for overlap checks', () => {
    const first = StayRange.fromStrings({
      checkIn: '2026-08-01',
      checkOut: '2026-08-05',
    });
    const adjacent = StayRange.fromStrings({
      checkIn: '2026-08-05',
      checkOut: '2026-08-08',
    });
    const overlapping = StayRange.fromStrings({
      checkIn: '2026-08-04',
      checkOut: '2026-08-07',
    });

    expect(first.overlaps(adjacent)).toBe(false);
    expect(first.overlaps(overlapping)).toBe(true);
  });
});
